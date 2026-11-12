import type { ChatClient } from 'easemob-websdk'
import { EmClient } from './client'
import { normalizeLoginOptions } from './client/login'
import { EmChat } from './chat'
import { EmContact } from './chat/contact'
import { EmGroupDomain } from './chat/group'
import { ensureUserInfos } from './chat/user-info'
import { connectionStore } from './store/connection'
import { contactRequestUnreadCount, contactStore } from './store/contact'
import { clearConversations, conversationStore, conversationUnreadCountOf as unreadCountOfConversation, setConversationPresentation as setConversationPresentationImpl, totalConversationUnread } from './store/conversation'
import { clearAllDrafts } from './store/draft'
import { groupStore, setGroupPresentation as setGroupPresentationImpl } from './store/group'
import { clearMessages, messageStore } from './store/message'
import { clearUsers, setUserPresentation as setUserPresentationImpl, userStore } from './store/user'
import { copyText, exportTextFile } from './platform'
import { downloadAttachment as downloadAttachmentImpl } from './utils/download'
import {
  attachmentCapability as getAttachmentCapability,
  canPickAttachment as canPickAttachmentImpl,
  pickAttachments as pickAttachmentsImpl,
  refreshAttachmentAvailability as refreshAttachmentAvailabilityImpl,
  resolveAttachment as resolveAttachmentImpl,
  setAttachmentProvider as setAttachmentProviderImpl
} from './attachment'
import { clearLogBuffer, createLogger, getLogText } from './utils/logger'
import { getLocale as getActiveLocale, setLocale as setActiveLocale } from './use/useLocale'
import { getAccountEpoch, invalidateAccountEpoch } from './chat/account'
import type { ConversationTypeValue } from './constants'
import type {
  CreateGroupParams,
  EmAttachmentCapability,
  EmAttachmentPickOptions,
  EmAttachmentProvider,
  EmContactInvite,
  EmConversationPresentation,
  EmGroup,
  EmGroupMemberListResult,
  EmGroupPresentation,
  EmKitConfig,
  EmLoginOptions,
  EmLocaleName,
  EmMessageHandler,
  EmMessageItem,
  EmMessageDownloadOptions,
  EmMessageDownloadResult,
  EmQuoteInfo,
  EmTokenRenewalResult,
  EmUserPresentation
} from './types'
import type { EmPickedFile, EmPickedImage, EmPickedVideo } from './platform'

const kitLogger = createLogger('kit')

// EmKit 门面：对外唯一入口，内部按功能拆分（client / chat / store / platform）
class EmKitImpl {
  readonly state = connectionStore
  readonly conversations = conversationStore
  readonly messages = messageStore
  readonly users = userStore
  readonly contacts = contactStore
  readonly groups = groupStore

  // 未读数便捷入口（非响应式快照；响应式请用 useUnreadCounts()/useTabBarBadge()）
  get conversationUnreadCount(): number {
    return totalConversationUnread.value
  }

  get contactRequestUnreadCount(): number {
    return contactRequestUnreadCount.value
  }

  // 单会话未读快照（入口角标）；响应式用 useConversationUnreadCount(id)
  conversationUnreadCountOf(conversationId: string): number {
    return unreadCountOfConversation(conversationId)
  }

  /** 附件能力快照：available = 当前端可选择文件（内置 H5/小程序 或宿主已注入 App provider） */
  get attachments(): EmAttachmentCapability {
    return getAttachmentCapability()
  }

  get canPickAttachment(): boolean {
    return canPickAttachmentImpl()
  }

  private client = new EmClient()
  private chat = new EmChat()
  private contact = new EmContact()
  private group = new EmGroupDomain()
  private kitConfig: EmKitConfig | null = null

  init(config: EmKitConfig): void {
    this.kitConfig = config
    this.client.init(config)
    // bind 推迟到 client 就绪后（小程序分包场景 SDK 模块异步到达）；
    // 就绪门在 init 内已挂上，先于业务后续调用的续体，bind 时序稳定。
    // 初始化失败只记录：业务入口（login 等）经 whenReady 拿到原始错误
    this.client
      .whenReady()
      .then((client) => {
        this.chat.bind(client, () => this.client.waitOnline(), config)
        this.contact.bind(client, () => this.client.waitOnline())
        this.group.bind(client, () => this.client.waitOnline(), {
          removeConversationLocal: (conversationId) => this.chat.removeConversationLocal(conversationId),
          updateConversationName: (conversationId, name) => this.chat.updateConversationName(conversationId, name),
          insertGroupNotice: (groupId, text) => this.chat.insertGroupNotice(groupId, text)
        })
      })
      .catch((e) => kitLogger.warn('kit bind skipped:', e))
  }

  /** SDK 初始化就绪门：resolve 于 SDK 模块加载 + ChatClient.init 完成，不代表已登录或连接在线；未 init 即 reject */
  whenReady(): Promise<ChatClient> {
    return this.client.whenReady()
  }

  /** 获取 UIKit 内部复用的原生 ChatClient，供 SDK 未封装能力使用；普通收发与状态管理仍优先走 EmKit */
  getSDKClient(): Promise<ChatClient> {
    return this.client.whenReady()
  }

  /** 切换界面语言（持久化；运行时立即生效） */
  setLocale(locale: EmLocaleName): void {
    setActiveLocale(locale)
  }

  getLocale(): EmLocaleName {
    return getActiveLocale()
  }

  async login(options: EmLoginOptions): Promise<void> {
    const loginOptions = normalizeLoginOptions(options, (message) => kitLogger.warn(message))
    const client = await this.client.whenReady()
    await this.client.login(loginOptions)
    this.chat.bind(client, () => this.client.waitOnline(), this.kitConfig ?? undefined)
    this.contact.bind(client, () => this.client.waitOnline())
    this.group.bind(client, () => this.client.waitOnline(), {
      removeConversationLocal: (conversationId) => this.chat.removeConversationLocal(conversationId),
      updateConversationName: (conversationId, name) => this.chat.updateConversationName(conversationId, name),
      insertGroupNotice: (groupId, text) => this.chat.insertGroupNotice(groupId, text)
    })
    // 登录成功即拉取自己的昵称/头像（会话页、聊天页己方气泡、demo mine 页回显）
    ensureUserInfos([loginOptions.userId])
    // 好友快照读内存（SDK 后台同步），失败不阻塞登录链路
    this.contact.syncContacts().catch(() => {})
    // 群快照读内存（SDK 后台同步），失败不阻塞登录链路
    this.group.getJoinedGroups().catch(() => {})
  }

  /** Token 续期：宿主从服务端换到新 token 后调用；配置 onTokenWillExpire 时可由 UIKit 自动续 */
  async renewToken(token: string): Promise<EmTokenRenewalResult> {
    return this.client.renewToken(token)
  }

  // 登出先失效账号代次并注销旧 handler，再断开 SDK 和清空私有状态。
  async logout(): Promise<void> {
    invalidateAccountEpoch()
    try {
      this.chat.leaveConversation()
    } catch (e) {}
    this.chat.unbind()
    this.contact.unbind()
    this.group.unbind()
    try {
      await this.client.logout()
    } finally {
      this.chat.reset()
      this.contact.reset()
      this.group.reset()
      clearConversations()
      clearMessages()
      clearUsers()
      clearAllDrafts()
    }
  }

  // ext：业务上下文载荷（多场景直进会话时携带订单/商品/来源页等），与引用/提及内部 key 合并
  async sendText(to: string, chatType: ConversationTypeValue, text: string, quote?: EmQuoteInfo, mentions?: string[], ext?: Record<string, unknown>): Promise<EmMessageItem> {
    await this.client.whenReady()
    return this.chat.sendText(to, chatType, text, quote, mentions, ext)
  }

  // 自定义消息（卡片消息主通道）：接收侧经 #custom-message 插槽按 customEvent 渲染
  async sendCustom(to: string, chatType: ConversationTypeValue, event: string, params?: Record<string, string>, ext?: Record<string, unknown>): Promise<EmMessageItem> {
    await this.client.whenReady()
    return this.chat.sendCustom(to, chatType, event, params, ext)
  }

  makeQuote(item: EmMessageItem): EmQuoteInfo {
    return this.chat.makeQuote(item)
  }

  async sendImage(to: string, chatType: ConversationTypeValue, image: EmPickedImage, ext?: Record<string, unknown>): Promise<EmMessageItem> {
    await this.client.whenReady()
    return this.chat.sendImage(to, chatType, image, ext)
  }

  async sendAudio(to: string, chatType: ConversationTypeValue, filePath: string, duration: number): Promise<EmMessageItem> {
    await this.client.whenReady()
    return this.chat.sendAudio(to, chatType, filePath, duration)
  }

  async sendVideo(to: string, chatType: ConversationTypeValue, video: EmPickedVideo): Promise<EmMessageItem> {
    await this.client.whenReady()
    return this.chat.sendVideo(to, chatType, video)
  }

  async sendFile(to: string, chatType: ConversationTypeValue, file: EmPickedFile): Promise<EmMessageItem> {
    await this.client.whenReady()
    return this.chat.sendFile(to, chatType, file)
  }

  /**
   * 注册宿主附件能力（App 端文件选择器）；传 null 注销。
   * UIKit 在用户点输入栏「文件」时经 provider.pick 通知宿主，宿主返回已 prepare 的本地路径。
   */
  setAttachmentProvider(provider: EmAttachmentProvider | null): void {
    setAttachmentProviderImpl(provider)
  }

  /** 主动刷新 provider 可用性（provider.isAvailable 依赖登录态等外部状态时调用） */
  refreshAttachmentAvailability(): void {
    refreshAttachmentAvailabilityImpl()
  }

  /** 发起附件选择（不发送）：宿主自定义 UI 或分享进入前置流程可直接调用 */
  async pickAttachments(options: EmAttachmentPickOptions): Promise<EmPickedFile[]> {
    return pickAttachmentsImpl(options)
  }

  /** 把外部 URI 交给宿主 provider 转换为可发送附件（未实现 resolve 时返回 null） */
  async resolveAttachment(uri: string, options?: EmAttachmentPickOptions): Promise<EmPickedFile | null> {
    return resolveAttachmentImpl(uri, options)
  }

  async loadHistory(conversationId: string, chatType: ConversationTypeValue, pageSize?: number): Promise<void> {
    await this.client.whenReady()
    return this.chat.loadHistory(conversationId, chatType, pageSize)
  }

  async syncConversations(): Promise<void> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.chat.syncConversations(expectedEpoch)
  }

  async enterConversation(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    await this.client.whenReady()
    return this.chat.enterConversation(conversationId, chatType)
  }

  /** 清会话未读（本地立即归零 + 服务端异步清零）；聊天页离页兜底与宿主自定义入口复用 */
  clearConversationUnread(conversationId: string, chatType: ConversationTypeValue, force = false): void {
    this.chat.clearConversationUnread(conversationId, chatType, force)
  }

  async pinConversation(conversationId: string, chatType: ConversationTypeValue, pinned: boolean): Promise<void> {
    await this.client.whenReady()
    return this.chat.pinConversation(conversationId, chatType, pinned)
  }

  async deleteConversation(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    await this.client.whenReady()
    return this.chat.deleteConversation(conversationId, chatType)
  }

  async clearConversationMessages(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    await this.client.whenReady()
    return this.chat.clearConversationMessages(conversationId, chatType)
  }

  async setConversationMuted(conversationId: string, chatType: ConversationTypeValue, muted: boolean): Promise<void> {
    await this.client.whenReady()
    return this.chat.setConversationMuted(conversationId, chatType, muted)
  }

  // 本地构造会话插列表（发起会话用，不调 SDK 建会话 API，对齐 vue 版 new-chat-modal 语义）
  addConversation(conversationId: string, chatType: ConversationTypeValue): void {
    this.chat.addConversation(conversationId, chatType)
  }

  async recallMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string): Promise<void> {
    await this.client.whenReady()
    return this.chat.recallMessage(conversationId, chatType, messageId)
  }

  async deleteMessage(message: EmMessageItem): Promise<void> {
    if (message.id !== '') {
      await this.client.whenReady()
    }
    return this.chat.deleteMessage(message)
  }

  // 编辑已发送的文本消息（M2.20，SDK modifyMessage）：单条次数上限见 constants MESSAGE_MODIFY_COUNT_LIMIT；
  // 成功回包本地 patch 后立即生效（对方与其他设备经 onMessageUpdated 事件同步）
  async modifyTextMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string, text: string): Promise<void> {
    await this.client.whenReady()
    return this.chat.modifyTextMessage(conversationId, chatType, messageId, text)
  }

  // 置顶/取消置顶消息（M2.20）：成功后本地立即打标并主动重拉置顶列表（SDK 不本端回推）
  async pinMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string): Promise<void> {
    await this.client.whenReady()
    return this.chat.pinMessage(conversationId, chatType, messageId)
  }

  async unpinMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string): Promise<void> {
    await this.client.whenReady()
    return this.chat.unpinMessage(conversationId, chatType, messageId)
  }

  // 拉取会话置顶列表（进会话时调用；SDK 不分页、上限 20 条），结果写入 messageStore.pinnedByConversationId
  async getPinnedMessageList(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    await this.client.whenReady()
    return this.chat.refreshPinnedMessages(conversationId, chatType)
  }

  deleteLocalMessage(conversationId: string, localId: string): void {
    this.chat.deleteLocalMessage(conversationId, localId)
  }

  // 下载消息附件（图片/视频保存到相册、文件下载并尝试打开；H5 浏览器下载）。
  // 长按菜单「下载」走同一实现；宿主自绘消息卡片时可复用。
  async downloadAttachment(message: EmMessageItem, options?: EmMessageDownloadOptions): Promise<EmMessageDownloadResult> {
    return downloadAttachmentImpl(message, options)
  }

  async resendMessage(conversationId: string, chatType: ConversationTypeValue, localId: string): Promise<void> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.chat.resendMessage(conversationId, chatType, localId, expectedEpoch)
  }

  async sendTyping(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    await this.client.whenReady()
    return this.chat.sendTyping(conversationId, chatType)
  }

  isReadReceiptEnabled(): boolean {
    return this.chat.readReceiptEnabled
  }

  /** 群已读回执是否开启（EmKitConfig.enableGroupReadReceipt，默认 false） */
  isGroupReadReceiptEnabled(): boolean {
    return this.chat.groupReadReceiptEnabled
  }

  /** 批量补齐群消息已读人数（SDK 单次上限 20，内部取最近 20 条己方已发送消息）；
   *  群已读回执关闭时 no-op。进会话/加载历史后调用，失败静默（展示类补充信息） */
  async refreshGroupReadCounts(conversationId: string): Promise<void> {
    await this.client.whenReady()
    return this.chat.refreshGroupReadCounts(conversationId)
  }

  leaveConversation(): void {
    this.chat.leaveConversation()
  }

  onMessage(handler: EmMessageHandler): () => void {
    return this.chat.onMessage(handler)
  }

  /** 订阅流式消息更新（M2.13，AI 流式输出）：分片合批后回调，msg.stream 携带最新全文/状态；
   *  返回取消函数（页面 onUnmounted 必须调用）。渲染由 store 响应式驱动，此订阅供外部副作用使用 */
  onStreamMessage(handler: EmMessageHandler): () => void {
    return this.chat.onStreamMessage(handler)
  }

  // 按需确保一批用户的昵称/头像已缓存（微任务合批，单次请求）
  ensureUserInfos(userIds: string[]): void {
    ensureUserInfos(userIds)
  }

  async syncContacts(): Promise<void> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.contact.syncContacts(expectedEpoch)
  }

  async addContact(userId: string, message = ''): Promise<void> {
    await this.client.whenReady()
    return this.contact.addContact(userId, message)
  }

  async deleteContact(userId: string): Promise<void> {
    await this.client.whenReady()
    return this.contact.deleteContact(userId)
  }

  async setContactRemark(userId: string, remark: string): Promise<void> {
    await this.client.whenReady()
    return this.contact.setContactRemark(userId, remark)
  }

  async acceptContactInvite(invite: EmContactInvite): Promise<void> {
    await this.client.whenReady()
    return this.contact.acceptContactInvite(invite)
  }

  async declineContactInvite(invite: EmContactInvite): Promise<void> {
    await this.client.whenReady()
    return this.contact.declineContactInvite(invite)
  }

  // ===== 群数据层（M2.9 Phase 1） =====

  // 已加入群快照整量回写（SDK 后台同步，读本地快照）
  async getJoinedGroups(): Promise<EmGroup[]> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.group.getJoinedGroups(expectedEpoch)
  }

  // 进群预热（对齐 enterConversation 的 fire-and-forget 用法）：拉群详情 + 成员首屏，失败静默
  async enterGroup(groupId: string): Promise<void> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    this.group.getGroupInfo(groupId, false, expectedEpoch).catch(() => {})
    this.group.getGroupMemberList(groupId, undefined, undefined, expectedEpoch).catch(() => {})
  }

  async getGroupInfo(groupId: string, force = false): Promise<EmGroup> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.group.getGroupInfo(groupId, force, expectedEpoch)
  }

  async getGroupMemberList(groupId: string, cursor?: string, pageSize?: number): Promise<EmGroupMemberListResult> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.group.getGroupMemberList(groupId, cursor, pageSize, expectedEpoch)
  }

  async getGroupAnnouncement(groupId: string): Promise<string> {
    const expectedEpoch = getAccountEpoch()
    await this.client.whenReady()
    return this.group.getGroupAnnouncement(groupId, expectedEpoch)
  }

  async createGroup(params: CreateGroupParams): Promise<string> {
    await this.client.whenReady()
    return this.group.createGroup(params)
  }

  async inviteUsersToGroup(groupId: string, userIds: string[]): Promise<void> {
    await this.client.whenReady()
    return this.group.inviteUsersToGroup(groupId, userIds)
  }

  // 接受/拒绝群邀请（group kind 申请；接受成功内部刷新群快照）
  async acceptGroupInvite(invite: EmContactInvite): Promise<void> {
    await this.client.whenReady()
    return this.group.acceptGroupInvite(invite)
  }

  async declineGroupInvite(invite: EmContactInvite): Promise<void> {
    await this.client.whenReady()
    return this.group.declineGroupInvite(invite)
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.leaveGroup(groupId)
  }

  async destroyGroup(groupId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.destroyGroup(groupId)
  }

  async changeGroupOwner(groupId: string, userId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.changeGroupOwner(groupId, userId)
  }

  async updateGroupInfo(groupId: string, partial: { name?: string, description?: string, avatar?: string }): Promise<void> {
    await this.client.whenReady()
    return this.group.updateGroupInfo(groupId, partial)
  }

  async updateGroupAnnouncement(groupId: string, content: string): Promise<void> {
    await this.client.whenReady()
    return this.group.updateGroupAnnouncement(groupId, content)
  }

  async removeGroupMembers(groupId: string, userIds: string[]): Promise<void> {
    await this.client.whenReady()
    return this.group.removeGroupMembers(groupId, userIds)
  }

  async addGroupAdmin(groupId: string, userId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.addGroupAdmin(groupId, userId)
  }

  async removeGroupAdmin(groupId: string, userId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.removeGroupAdmin(groupId, userId)
  }

  async muteAllGroupMembers(groupId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.muteAllGroupMembers(groupId)
  }

  async unmuteAllGroupMembers(groupId: string): Promise<void> {
    await this.client.whenReady()
    return this.group.unmuteAllGroupMembers(groupId)
  }

  // 注入宿主业务资料：优先于 SDK 昵称/头像参与全库回落链（会话列表/聊天页标题/通讯录/群成员名），
  // SDK 资料回推不会冲掉；null 清除。登出时随账号清空，宿主在 login 后重新注入
  setUserPresentation(userId: string, patch: EmUserPresentation | null): void {
    setUserPresentationImpl(userId, patch)
  }

  // 注入宿主业务资料：name/avatar 优先于 SDK 会话名/头像（会话列表条目、长按菜单标题、聊天页标题回落链），
  // ext 随 #title / #title-extra / #avatar 插槽 scope 透出供标签等自绘；null 清除
  setConversationPresentation(conversationId: string, patch: EmConversationPresentation | null): void {
    setConversationPresentationImpl(conversationId, patch)
  }

  // 注入宿主业务资料：name/avatar 优先于 SDK 群名/群头像（会话列表、聊天页标题、群列表、群详情），
  // ext 随群详情 #name-extra 与聊天页 #title 插槽 scope 透出；null 清除
  setGroupPresentation(groupId: string, patch: EmGroupPresentation | null): void {
    setGroupPresentationImpl(groupId, patch)
  }

  // 系统提示消息（本地灰条，不发服务端）：交易状态/医疗提示/客服转接等场景通用
  insertLocalNotice(conversationId: string, chatType: ConversationTypeValue, text: string): void {
    this.chat.insertLocalNotice(conversationId, chatType, text)
  }

  // 群系统通知（本地灰条，不发服务端）：建群成功等本地链路插通知的入口
  insertGroupNotice(groupId: string, text: string): void {
    this.chat.insertGroupNotice(groupId, text)
  }

  // 导出调试日志全文（最多 2000 行 / 256 Ki 字符，单条最多 4096 字符，含被 level 过滤掉的 debug 行）：
  // H5 触发浏览器下载返回 'download'；小程序/App 写用户数据目录返回文件路径
  // （并 best-effort 复制全文到剪贴板）；写文件失败兜底剪贴板返回 'clipboard'
  async exportLogs(): Promise<string> {
    const text = getLogText()
    try {
      const path = await exportTextFile(`emkit-logs-${Date.now()}.txt`, text)
      if (path === '') {
        return 'download'
      }
      await copyText(text).catch(() => {})
      return path
    } catch (e) {
      // 不要静默吞：App 端写文件失败的原因（编码/沙盒路径/基座缺模块）必须能从控制台看到
      kitLogger.warn('exportLogs: 写文件失败，已回退剪贴板', e)
      await copyText(text).catch(() => {})
      return 'clipboard'
    }
  }

  getLogText(): string {
    return getLogText()
  }

  clearLogs(): void {
    clearLogBuffer()
  }
}

export const EmKit = new EmKitImpl()

export * from './types'
export * from './constants'
export { setStorage, getStorage, chooseImage, previewImage, chooseVideo, chooseFile, startRecord, stopRecord, isRecording, playAudio, stopAudio, PLATFORM_CAPABILITIES, isPageVisible, copyText, getCameraAuthorizeState, openAppAuthorizeSetting } from './platform'
export type { EmPickedVideo, EmPickedFile, EmPickedImage, EmRecordResult, EmRecordOptions, EmPlatformCapabilities, EmCameraAuthorizeState } from './platform'
export {
  setAttachmentProvider,
  refreshAttachmentAvailability,
  hasAttachmentProvider,
  canPickAttachment,
  attachmentCapability,
  pickAttachments,
  resolveAttachment
} from './attachment'
export { useNamespace } from './use/useNamespace'
export {
  useTheme,
  initTheme,
  setTheme,
  getTheme,
  syncNativeThemeUI,
  THEME_STORAGE_KEY
} from './use/useTheme'
export type { EmThemeInitOptions, EmThemeSyncOptions } from './use/useTheme'
export { useThemeChrome } from './use/useThemeChrome'
export type { EmThemeChromeOptions, EmThemeChromeColors } from './use/useThemeChrome'
export { useLocale, mergeMessages, initLocale, setLocale, getLocale, LOCALE_STORAGE_KEY } from './use/useLocale'
export { useSafeArea, getSafeAreaBottom, getSafeAreaTop } from './use/useSafeArea'
export { useChatComposer } from './use/useChatComposer'
export type { UseChatComposerOptions, UseChatComposerResult } from './use/useChatComposer'
export { nextZIndex } from './use/usePopup'
export { useConfig, setConfig } from './store/config'
export { themeStore } from './store/theme'
export { userStore, displayNameOf, avatarOf, mergeUserInfo, setUserPresentation } from './store/user'
export { contactStore, contactDisplayNameOf, pendingInviteCount, contactRequestUnreadCount } from './store/contact'
export { conversationStore, totalConversationUnread, conversationUnreadCountOf, setConversationPresentation } from './store/conversation'
export { useUnreadCounts, getUnreadCounts, useConversationUnreadCount } from './use/useUnreadCounts'
export type { EmUnreadCounts } from './use/useUnreadCounts'
export { useTabBarBadge, syncTabBarBadges } from './use/useTabBarBadge'
export type { EmTabBarBadgeOptions, EmTabBarBadgeController } from './use/useTabBarBadge'
export { groupStore, groupDisplayNameOf, groupAvatarOf, setGroupPresentation, groupMemberDisplayNameOf, sortGroupMembers } from './store/group'
export { ensureUserInfos } from './chat/user-info'
export { setPinyinAdapter, groupContacts, matchContact, resolveAlphabetKeyByOffsetY } from './utils/pinyin'
export { downloadAttachment, attachmentFileNameOf, downloadKindOf, downloadUrlOf } from './utils/download'
export type { EmPinyinResult, EmContactGroup } from './utils/pinyin'
export { filterActiveMentions, parseMentions } from './utils/mention'
export type { EmMentionSegment } from './utils/mention'
export { isStreamActive, isStreamTerminal, isPlainTextStream, isRichStream } from './utils/stream'
export { ensureSdkModule, setSdkLoader, setSdkModule } from './client/sdk'
export type { EmSdkModule } from './client/sdk'
export { createLogger, setLogLevel, getLogLevel, getLogText, clearLogBuffer, getLogBufferSize, logPayload } from './utils/logger'
export type { EmLogger } from './utils/logger'
