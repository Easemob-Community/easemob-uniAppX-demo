// EmChat 门面：对外类名与方法签名保持不变（libs/index.ts 的 EmKitImpl 纯透传）。
// 内部按域拆分——消息生命周期域（含 typing 信令）在 ./message（EmMessageDomain），
// 会话域（列表同步/置顶/免打扰/删除/清空 + wire 映射）在 ./conversation（EmConversationDomain）；
// 本文件只做两件事：组合两个域模块、bind() 里接线 SDK ChatManager 事件并按域分发。
// SDK wire 协议字段的兼容映射保留在各域文件的边界处（规范允许的例外）。
// 消息/会话方法全部显式携带 chatType（M2.9 群基础，breaking）；
// 群数据域在 ./group（EmGroupDomain），由 libs/index.ts 的 EmKitImpl 直接组合。
import type { ChatClient, Message, MultiDeviceEvent, StreamMessage } from 'easemob-websdk'
import { CONVERSATION_TYPE, ERROR_CODE, MESSAGE_EXT_KEY } from '../constants'
import type { ConversationTypeValue } from '../constants'
import { connectionStore } from '../store/connection'
import { conversationStore } from '../store/conversation'
import { uiConfig } from '../store/config'
import { createLogger } from '../utils/logger'
import type { EmKitConfig, EmMessageHandler, EmMessageItem, EmQuoteInfo } from '../types'
import { isPageVisible } from '../platform'
import type { EmPickedFile, EmPickedImage, EmPickedVideo } from '../platform'
import { bindUserInfo, ensureUserInfos } from './user-info'
import { EmConversationDomain } from './conversation'
import { EmMessageDomain } from './message'
import type { EmChatContext } from './message'
import { getAccountEpoch, isAccountEpochCurrent } from './account'

const logger = createLogger('chat')

export class EmChat {
  private ctx: EmChatContext = { client: null, waitOnline: null }
  private messages = new EmMessageDomain(this.ctx)
  private conversations = new EmConversationDomain(this.ctx, this.messages)
  private bound = false

  bind(client: ChatClient, waitOnline: () => Promise<void>, config?: EmKitConfig): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.ctx.client = client
    this.ctx.waitOnline = waitOnline
    const syncHandlerEpoch = getAccountEpoch()
    this.messages.readReceiptOn = config?.enableReadReceipt !== false
    bindUserInfo(client)
    client.chatManager.addEventHandler('emkit-message', {
      onMessage: (message: Message) => {
        // SDK wire 边界：cmd 信号消息（typing 等）不落消息列表，在此拦截
        if ((message.type as string) === 'cmd') {
          this.messages.onCmdMessage(message)
          return
        }
        const item = this.messages.toMessageItem(message)
        // 统一入口含流式丢片补偿：同 msgServerId 的流式副本存在时用完整消息覆盖并收敛终态
        this.messages.ingestIncoming(item)
        ensureUserInfos([item.from])
        // 群聊「有人@我」检测（接收侧）：ext em_at_list 含当前 userId 且非自己发送才置位；
        // 清除时机在 enterConversation（对齐 vue 版 conversation.hasAtMe 语义）
        if (item.chatType === CONVERSATION_TYPE.GROUP_CHAT && !item.self) {
          const mentionList = item.ext[MESSAGE_EXT_KEY.MENTION]
          if (Array.isArray(mentionList) && mentionList.includes(connectionStore.userId)) {
            conversationStore.atMeByConversationId[item.conversationId] = true
          }
        }
        // 在当前会话收到对方消息：清服务端未读（按会话合批）+ 即时回已读回执（群聊仅在开启群回执时上报）。
        // 不清未读的话，离开会话后 refreshSessionList/冷启动会把刚读过的会话又显示成未读（见 clearUnread 注释）
        // H5 标签页隐藏时用户并未看到，保持未读、不发回执（App/小程序 isPageVisible 恒 true，行为不变）
        if (!item.self && item.conversationId === this.conversations.currentConversationId && isPageVisible()) {
          this.conversations.clearUnread(item.conversationId, item.chatType)
          this.messages.sendReadReceipts(item.conversationId, item.chatType).catch(() => {})
        }
      },
      // 流式消息（AI 流式输出）：分片合并 / 合批写 store 全部收口消息域；
      // onMessage 仍只承载「完整消息」语义，流式增量走 EmKit.onStreamMessage 专用订阅
      onStreamMessage: (message: StreamMessage) => {
        this.messages.handleStreamMessage(message)
      },
      onConversationListUpdate: (payload) => {
        // 热路径：每条消息都会触发会话列表更新，这里只打数量，避免每次深拷贝整份 payload
        logger.debug('onConversationListUpdate, count:', payload.items.length)
        conversationStore.items = payload.items.map((c) => this.conversations.toConversationItem(c))
        ensureUserInfos(conversationStore.items.filter((c) => c.chatType === CONVERSATION_TYPE.SINGLE_CHAT).map((c) => c.conversationId))
        // 会话列表快照不携带免打扰状态（见 toConversationItem）：仅在服务端会话同步/基线重置后
        // 追加一次 PushManager 批量校正；消息/profile 热路径不查，避免每条消息一次 REST
        if (payload.patch?.reset === true || payload.reason === 'conversation') {
          this.conversations.syncConversationMuteStates()
        }
      },
      onMessageRecalled: (payload) => {
        this.messages.markRecalled(payload.conversationId, payload.messageId)
      },
      // 远程消息编辑（本端编辑走 modifyTextMessage 成功回包本地 patch，SDK 事件不回推操作设备）
      onMessageUpdated: (payload) => {
        this.messages.applyMessageUpdated(payload)
      },
      // 远端/其他设备置顶变更：操作设备经 Promise 拿结果不走事件，统一重拉该会话置顶列表
      onPinnedMessageChanged: (payload) => {
        this.messages.onPinnedMessageChanged(payload.conversationId, payload.conversationType as string)
      },
      onMessageReadReceipts: (receipts) => {
        receipts.forEach((r) => {
          if (r.conversationType === CONVERSATION_TYPE.GROUP_CHAT) {
            // 群回执事件直接带每条消息的累计已读人数；未开启群回执时域内忽略
            const groupReceipt = r as unknown as { receiptDetails?: ReadonlyArray<{ messageId: string, count: number }> }
            this.messages.applyGroupReadReceipts(r.conversationId, groupReceipt.receiptDetails ?? [])
            return
          }
          this.messages.applyPeerReadTime(r.conversationType, r.conversationId, r.timestamp)
        })
      },
      // 单聊送达回执：只打标（EmMessageItem.delivered），已读展示仍以已读回执时间为准
      onMessageDelivered: (payload) => {
        this.messages.applyMessageDelivered(payload.conversationId, payload.messageId)
      }
    })
    client.addEventHandler('emkit-conversation-sync', {
      onSyncDataStart: (payload) => {
        if (!isAccountEpochCurrent(syncHandlerEpoch)) return
        if (payload.dataType === 'conversation') this.conversations.onSyncDataStart()
      },
      onSyncDataFinished: (payload) => {
        if (!isAccountEpochCurrent(syncHandlerEpoch) || payload.dataType !== 'conversation') return
        if (payload.status === 'failed') {
          logger.warn('conversation sync failed:', payload.error?.stage, payload.error?.message)
        }
        this.conversations.onSyncDataFinished(payload.status === 'failed')
      }
    })
    // 多设备会话事件（ChatClient 级）：其他端切免打扰后本端列表 icon 同步；
    // 会话列表快照不携带该状态，多设备事件是运行期唯一实时来源（轮询校正见 syncConversationMuteStates）
    client.addEventHandler('emkit-multi-device', {
      onMultiDeviceConversation: (event: MultiDeviceEvent) => {
        if (event.category !== 'conversation') return
        if (event.operation !== 'CONVERSATION_MUTE_INFO_CHANGED') return
        this.conversations.applyMuteInfoChanged(event.conversationId, event.remindType)
      },
      // 其他端删除漫游消息（含审核删除）：本地同步移除，避免列表残留；命中后校正会话摘要
      onMultiDeviceMessageRemoved: (event) => {
        if (this.messages.onMultiDeviceMessageRemoved(event)) {
          this.conversations.syncMessageSummary(event.conversationId)
        }
      },
      // 发送队列超时（payload 不带消息 id）：仍在 SENDING 的己方消息落 FAILED 并归因，供气泡重发/查看原因
      onSendTimeout: () => {
        this.messages.failPendingSends(ERROR_CODE.SEND_TIMEOUT)
      }
    })
  }

  unbind(): void {
    const client = this.ctx.client
    if (client != null) {
      client.chatManager.removeEventHandler('emkit-message')
      client.removeEventHandler('emkit-conversation-sync')
      client.removeEventHandler('emkit-multi-device')
    }
    this.bound = false
    this.ctx.client = null
    this.ctx.waitOnline = null
  }

  get readReceiptEnabled(): boolean {
    return this.messages.readReceiptOn
  }

  get groupReadReceiptEnabled(): boolean {
    return uiConfig.enableGroupReadReceipt
  }

  // 返回取消函数（unsubscriber）：宿主页面卸载时调用，防 handlers 泄漏叠加触发
  onMessage(handler: EmMessageHandler): () => void {
    return this.messages.onMessage(handler)
  }

  // 流式消息订阅（M2.13）：分片合批后回调（msg.stream 为最新全文/状态），返回取消函数
  onStreamMessage(handler: EmMessageHandler): () => void {
    return this.messages.onStreamMessage(handler)
  }

  async sendText(to: string, chatType: ConversationTypeValue, text: string, quote?: EmQuoteInfo, mentions?: string[], ext?: Record<string, unknown>): Promise<EmMessageItem> {
    return this.messages.sendText(to, chatType, text, quote, mentions, ext)
  }

  // 自定义消息（卡片消息主通道）：event 业务事件名 / params SDK 字符串参数 / ext 结构化载荷
  async sendCustom(to: string, chatType: ConversationTypeValue, event: string, params?: Record<string, string>, ext?: Record<string, unknown>): Promise<EmMessageItem> {
    return this.messages.sendCustom(to, chatType, event, params, ext)
  }

  makeQuote(item: EmMessageItem): EmQuoteInfo {
    return this.messages.makeQuote(item)
  }

  async sendImage(to: string, chatType: ConversationTypeValue, image: EmPickedImage, ext?: Record<string, unknown>): Promise<EmMessageItem> {
    return this.messages.sendImage(to, chatType, image, ext)
  }

  async sendAudio(to: string, chatType: ConversationTypeValue, filePath: string, duration: number): Promise<EmMessageItem> {
    return this.messages.sendAudio(to, chatType, filePath, duration)
  }

  async sendVideo(to: string, chatType: ConversationTypeValue, video: EmPickedVideo): Promise<EmMessageItem> {
    return this.messages.sendVideo(to, chatType, video)
  }

  async sendFile(to: string, chatType: ConversationTypeValue, file: EmPickedFile): Promise<EmMessageItem> {
    return this.messages.sendFile(to, chatType, file)
  }

  async loadHistory(conversationId: string, chatType: ConversationTypeValue, pageSize = 20): Promise<void> {
    return this.messages.loadHistory(conversationId, chatType, pageSize)
  }

  // 群消息已读人数批量补齐（uiConfig.enableGroupReadReceipt 关闭时 no-op）
  async refreshGroupReadCounts(conversationId: string): Promise<void> {
    return this.messages.refreshGroupReadCounts(conversationId)
  }

  async syncConversations(expectedEpoch?: number): Promise<void> {
    return this.conversations.syncConversations(expectedEpoch)
  }

  async enterConversation(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    return this.conversations.enterConversation(conversationId, chatType)
  }

  leaveConversation(): void {
    this.conversations.leaveConversation()
  }

  /** 清会话未读：本地 store 立即归零 + 服务端异步清零（宿主/聊天页离页兜底用） */
  clearConversationUnread(conversationId: string, chatType: ConversationTypeValue, force = false): void {
    this.conversations.clearUnread(conversationId, chatType, force)
  }

  // 登出/换账号：清域内计时器、失败消息的本地 File 缓存与当前会话游标
  reset(): void {
    this.conversations.reset()
    this.messages.reset()
  }

  async pinConversation(conversationId: string, chatType: ConversationTypeValue, pinned: boolean): Promise<void> {
    return this.conversations.pinConversation(conversationId, chatType, pinned)
  }

  async deleteConversation(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    return this.conversations.deleteConversation(conversationId, chatType)
  }

  async clearConversationMessages(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    return this.conversations.clearConversationMessages(conversationId, chatType)
  }

  async setConversationMuted(conversationId: string, chatType: ConversationTypeValue, muted: boolean): Promise<void> {
    return this.conversations.setConversationMuted(conversationId, chatType, muted)
  }

  // 本地构造会话插列表（发起会话用，不调 SDK，对齐 vue 版 new-chat-modal 语义）
  addConversation(conversationId: string, chatType: ConversationTypeValue): void {
    this.conversations.addConversation(conversationId, chatType)
  }

  // 群域事件钩子：被移出群/群解散时本地删会话清消息（不调 SDK）
  removeConversationLocal(conversationId: string): void {
    this.conversations.removeConversationLocal(conversationId)
  }

  // 群域事件钩子：群名变更同步会话名
  updateConversationName(conversationId: string, name: string): void {
    this.conversations.updateConversationName(conversationId, name)
  }

  // 系统提示消息（本地灰条，不发服务端）：多场景通用入口（交易状态/医疗提示/转接通知）
  insertLocalNotice(conversationId: string, chatType: ConversationTypeValue, text: string): void {
    this.messages.insertLocalNotice(conversationId, chatType, text)
  }

  // 群系统通知别名（群域事件与建群链路沿用）；等价 insertLocalNotice(groupId, groupChat, text)
  insertGroupNotice(groupId: string, text: string): void {
    this.insertLocalNotice(groupId, CONVERSATION_TYPE.GROUP_CHAT, text)
  }

  async recallMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string): Promise<void> {
    return this.messages.recallMessage(conversationId, chatType, messageId)
  }

  // 编辑已发送的文本消息（M2.20）：成功后同步会话摘要（编辑可能改变末条消息预览）
  async modifyTextMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string, text: string): Promise<void> {
    await this.messages.modifyTextMessage(conversationId, chatType, messageId, text)
    this.conversations.syncMessageSummary(conversationId)
  }

  async pinMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string): Promise<void> {
    return this.messages.pinMessage(conversationId, chatType, messageId)
  }

  async unpinMessage(conversationId: string, chatType: ConversationTypeValue, messageId: string): Promise<void> {
    return this.messages.unpinMessage(conversationId, chatType, messageId)
  }

  async refreshPinnedMessages(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    return this.messages.refreshPinnedMessages(conversationId, chatType)
  }

  async deleteMessage(message: EmMessageItem): Promise<void> {
    await this.messages.deleteMessage(message)
    this.conversations.syncMessageSummary(message.conversationId)
  }

  deleteLocalMessage(conversationId: string, localId: string): void {
    const deleted = this.messages.deleteLocalMessage(conversationId, localId)
    if (deleted) {
      this.conversations.syncMessageSummary(conversationId)
    }
  }

  async resendMessage(conversationId: string, chatType: ConversationTypeValue, localId: string, expectedEpoch?: number): Promise<void> {
    return this.messages.resendMessage(conversationId, chatType, localId, expectedEpoch)
  }

  async sendTyping(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    return this.messages.sendTyping(conversationId, chatType)
  }
}
