// 会话域：会话列表同步、进入/离开会话、置顶、免打扰、删除会话、清空聊天记录，
// 以及 ConversationItem / 摘要的 wire → 中立类型映射（SDK wire 兼容字面量集中在本文件边界）。
// 门面（./index.ts）负责组合本域与消息域并接线 SDK 事件。
import type { ConversationItem, PushManager, SessionMessageSnippet } from 'easemob-websdk'
import { CONVERSATION_SILENT_MODE_BATCH_SIZE, CONVERSATION_TYPE, CONVERSATION_UNREAD_CLEAR_THROTTLE, MESSAGE_STATUS, MESSAGE_TYPE } from '../constants'
import type { ConversationTypeValue } from '../constants'
import { connectionStore } from '../store/connection'
import { conversationStore } from '../store/conversation'
import { messageStore } from '../store/message'
import { groupDisplayNameOf, groupStore } from '../store/group'
import { avatarOf } from '../store/user'
import { contactDisplayNameOf } from '../store/contact'
import { clearDraft } from '../store/draft'
import { createLogger } from '../utils/logger'
import type { EmConversationItem } from '../types'
import { useLocale } from '../use/useLocale'
import { ensureUserInfos } from './user-info'
import type { EmChatContext } from './message'
import { mapWireChatType } from './message'
import type { EmMessageDomain } from './message'
import { getAccountEpoch, invalidateAccountEpoch, isAccountEpochCurrent } from './account'

const logger = createLogger('chat')

interface ConversationSettingQueue<T> {
  conversationId: string
  generation: number
  accountGeneration: number
  tail: Promise<void>
  latestRequestId: number
  settlementRevision: number
  pendingCount: number
  settledValue: T
}

interface ConversationPinValue {
  isPinned: boolean
  pinnedTime: number
}

/** 会话列表查找共享 helper（乐观更新回写/摘要清零/快照对齐的公共入口） */
export function findConversation(conversationId: string): EmConversationItem | undefined {
  return conversationStore.items.find((c) => c.conversationId === conversationId)
}

export class EmConversationDomain {
  currentConversationId = ''
  // 当前会话收消息清服务端未读的最近一次时间（按会话合批，见 clearUnread）
  private lastUnreadClearAtByConversationId: Record<string, number> = {}
  private pinQueueByConversationId: Record<string, ConversationSettingQueue<ConversationPinValue>> = {}
  private muteQueueByConversationId: Record<string, ConversationSettingQueue<boolean>> = {}
  private settingGenerationByConversationId: Record<string, number> = {}
  private accountGeneration = 0
  private syncRequestId = 0

  constructor(private ctx: EmChatContext, private messages: EmMessageDomain) {}

  async syncConversations(expectedEpoch = getAccountEpoch()): Promise<void> {
    const requestId = this.syncRequestId + 1
    this.syncRequestId = requestId
    if (!isAccountEpochCurrent(expectedEpoch)) return
    conversationStore.syncing = true
    conversationStore.syncFailed = false
    const pinRequestIdByConversationId: Record<string, number> = {}
    const pinSettlementRevisionByConversationId: Record<string, number> = {}
    conversationStore.items.forEach((c) => {
      const queue = this.pinQueueByConversationId[c.conversationId]
      pinRequestIdByConversationId[c.conversationId] = queue?.latestRequestId ?? 0
      pinSettlementRevisionByConversationId[c.conversationId] = queue?.settlementRevision ?? 0
    })
    const isCurrent = (): boolean => isAccountEpochCurrent(expectedEpoch) && requestId === this.syncRequestId
    try {
      const chatManager = await this.messages.readyChatManager()
      if (!isCurrent()) return
      // 空结果是正常状态（新账号还没有会话），不是失败：SDK 在无会话时可能返回 undefined/null，
      // 直接读 .length 会抛错并被 catch 误判成「拉取失败」，这里统一归一成数组。
      const rawItems = await chatManager.refreshSessionList()
      if (!isCurrent()) return
      const items = rawItems ?? []
      logger.info('syncConversations done, count:', items.length)
      conversationStore.items = items.map((c) => this.toConversationItem(
        c,
        pinRequestIdByConversationId[c.conversationId] ?? 0,
        pinSettlementRevisionByConversationId[c.conversationId] ?? 0
      ))
      conversationStore.loaded = true
      conversationStore.syncFailed = false
      ensureUserInfos(conversationStore.items.filter((c) => c.chatType === CONVERSATION_TYPE.SINGLE_CHAT).map((c) => c.conversationId))
      this.syncConversationMuteStates(expectedEpoch)
    } catch (e) {
      if (isCurrent()) conversationStore.syncFailed = true
      throw e
    } finally {
      if (isCurrent()) conversationStore.syncing = false
    }
  }

  onSyncDataStart(): void {
    this.syncRequestId += 1
    conversationStore.syncing = true
    conversationStore.syncFailed = false
  }

  onSyncDataFinished(failed: boolean): void {
    this.syncRequestId += 1
    conversationStore.syncing = false
    if (failed) {
      conversationStore.syncFailed = true
      return
    }
    const manager = this.ctx.client?.chatManager
    if (manager == null) {
      conversationStore.syncFailed = true
      return
    }
    const rawItems = manager.getConversationList()
    const items = rawItems ?? []
    conversationStore.items = items.map((c) => this.toConversationItem(c))
    conversationStore.loaded = true
    conversationStore.syncFailed = false
    this.syncConversationMuteStates()
  }

  async enterConversation(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    const chatManager = await this.messages.readyChatManager()
    this.currentConversationId = conversationId
    // 当前会话不参与后台内存裁剪（P1-10）；离开时再按上限裁
    this.messages.setActiveConversation(conversationId)
    chatManager.setCurrentConversation({ conversationId, conversationType: chatType })
    // 进会话立即清未读（本地 store + 服务端）；当前会话收消息的合批清理见 clearUnread
    this.clearUnread(conversationId, chatType, true)
    // 进入会话即回已读回执（对齐 vue 版会话切换 sendChannelAck 的时机；群聊内部短路）
    this.messages.sendReadReceipts(conversationId, chatType).catch(() => {})
    // 确保对端与己方资料已缓存（气泡头像/昵称、导航标题用）；群聊由群数据层供给资料
    if (chatType === CONVERSATION_TYPE.SINGLE_CHAT) {
      ensureUserInfos([conversationId, connectionStore.userId])
    }
    // 进入会话清除「有人@我」未读标记（对齐 vue 版会话选中清 atMe 的时机）
    if (conversationStore.atMeByConversationId[conversationId] === true) {
      delete conversationStore.atMeByConversationId[conversationId]
    }
  }

  leaveConversation(): void {
    const conversationId = this.currentConversationId
    this.currentConversationId = ''
    this.messages.setActiveConversation('')
    // 离开即裁剪：下次进入由 loadHistory 的 trimmed 标记重拉最新页（游标不会指向已丢弃的消息）
    if (conversationId !== '') this.messages.trimConversation(conversationId)
    this.ctx.client?.chatManager.resetCurrentConversation()
  }

  /**
   * 清会话未读（本地 store 立即归零 + 服务端异步清零）。
   * - 进会话/离开会话：force=true，立即发请求；
   * - 当前会话收消息：默认按 CONVERSATION_UNREAD_CLEAR_THROTTLE 合批，避免每条消息一次 REST；
   *   服务端不清的话，下次 refreshSessionList/冷启动会把刚读过的会话又显示成未读。
   */
  clearUnread(conversationId: string, chatType: ConversationTypeValue, force = false): void {
    const item = findConversation(conversationId)
    if (item != null && item.unreadCount !== 0) {
      item.unreadCount = 0
    }
    const client = this.ctx.client
    if (client == null) return
    const now = Date.now()
    const last = this.lastUnreadClearAtByConversationId[conversationId] ?? 0
    if (!force && now - last < CONVERSATION_UNREAD_CLEAR_THROTTLE) return
    this.lastUnreadClearAtByConversationId[conversationId] = now
    client.chatManager.clearConversationUnreadMessageCount({ conversationId, conversationType: chatType })
      .catch((e) => {
        logger.warn('clearConversationUnread fail:', conversationId, e)
      })
  }

  // 登出/换账号：提升账号代次，旧账号队列闭包即使稍后完成也不能回写新账号状态
  reset(): void {
    this.currentConversationId = ''
    this.accountGeneration += 1
    this.syncRequestId += 1
    invalidateAccountEpoch()
    this.lastUnreadClearAtByConversationId = {}
    this.pinQueueByConversationId = {}
    this.muteQueueByConversationId = {}
    this.settingGenerationByConversationId = {}
  }

  pinConversation(conversationId: string, chatType: ConversationTypeValue, pinned: boolean): Promise<void> {
    const queue = this.pinQueueOf(conversationId)
    const item = findConversation(conversationId)
    if (item != null) {
      item.isPinned = pinned
    }
    return this.enqueueSetting(queue, async () => {
      const chatManager = await this.messages.readyChatManager()
      const result = await chatManager.setConversationPinned({ conversationId, conversationType: chatType, pinned })
      const isPinned = result.isPinned ?? pinned
      return {
        isPinned,
        // 置顶时间以服务端返回为准（排序主键）；缺失时本地补齐，保证置顶区间顺序稳定
        pinnedTime: isPinned ? (result.pinnedTime ?? Date.now()) : 0
      }
    }, (value) => {
      const current = findConversation(conversationId)
      if (current != null) {
        current.isPinned = value.isPinned
        current.pinnedTime = value.pinnedTime
      }
    })
  }

  private pinQueueOf(conversationId: string): ConversationSettingQueue<ConversationPinValue> {
    const existing = this.pinQueueByConversationId[conversationId]
    if (existing != null) return existing
    const item = findConversation(conversationId)
    const queue: ConversationSettingQueue<ConversationPinValue> = {
      conversationId,
      generation: this.settingGenerationByConversationId[conversationId] ?? 0,
      accountGeneration: this.accountGeneration,
      tail: Promise.resolve(),
      latestRequestId: 0,
      settlementRevision: 0,
      pendingCount: 0,
      settledValue: {
        isPinned: item?.isPinned ?? false,
        pinnedTime: item?.pinnedTime ?? 0
      }
    }
    this.pinQueueByConversationId[conversationId] = queue
    return queue
  }

  // 同一设置按调用顺序串行；旧响应/失败不得覆盖更新的意图，失败回滚取失败时的最新已确认值
  private enqueueSetting<T>(
    queue: ConversationSettingQueue<T>,
    request: () => Promise<T>,
    apply: (value: T) => void
  ): Promise<void> {
    queue.latestRequestId += 1
    const requestId = queue.latestRequestId
    queue.pendingCount += 1
    const run = queue.tail.then(async () => {
      try {
        const value = await request()
        const active = this.isSettingQueueActive(queue)
        if (active) {
          queue.settledValue = value
          if (requestId === queue.latestRequestId) {
            apply(value)
          }
          queue.settlementRevision += 1
        }
      } catch (e) {
        const active = this.isSettingQueueActive(queue)
        if (active) {
          if (requestId === queue.latestRequestId) {
            apply(queue.settledValue)
          }
          queue.settlementRevision += 1
        }
        throw e
      } finally {
        queue.pendingCount -= 1
      }
    })
    queue.tail = run.then(() => undefined, () => undefined)
    return run
  }

  private isSettingQueueActive<T>(queue: ConversationSettingQueue<T>): boolean {
    if (queue.accountGeneration !== this.accountGeneration) return false
    const generation = this.settingGenerationByConversationId[queue.conversationId] ?? 0
    if (queue.generation !== generation) return false
    return this.pinQueueByConversationId[queue.conversationId] === queue
      || this.muteQueueByConversationId[queue.conversationId] === queue
  }

  private invalidateConversationSettings(conversationId: string): void {
    this.settingGenerationByConversationId[conversationId] = (this.settingGenerationByConversationId[conversationId] ?? 0) + 1
    delete this.pinQueueByConversationId[conversationId]
    delete this.muteQueueByConversationId[conversationId]
  }

  async deleteConversation(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    const chatManager = await this.messages.readyChatManager()
    await chatManager.deleteConversation({ conversationId, conversationType: chatType })
    this.removeConversationLocal(conversationId)
  }

  // 本地删除会话（不调 SDK）：被移出群/群解散等事件路径用；清消息缓存、游标与持久化草稿，
  // 被删会话是当前会话时复位 currentConversationId（对齐 vue 版 deleteConversation 语义）
  removeConversationLocal(conversationId: string): void {
    this.invalidateConversationSettings(conversationId)
    this.messages.forgetStreams(conversationId)
    clearDraft(conversationId)
    conversationStore.items = conversationStore.items.filter((c) => c.conversationId !== conversationId)
    delete conversationStore.atMeByConversationId[conversationId]
    delete messageStore.messagesByConversationId[conversationId]
    delete messageStore.cursorByConversationId[conversationId]
    delete messageStore.hasMoreByConversationId[conversationId]
    if (this.currentConversationId === conversationId) {
      this.currentConversationId = ''
    }
  }

  // 本地构造会话插列表（发起会话用，不调 SDK 建会话 API，对齐 vue 版 new-chat-modal 语义）；
  // 已存在则不动（名称/头像以 SDK 同步为准）
  addConversation(conversationId: string, chatType: ConversationTypeValue): void {
    if (findConversation(conversationId) != null) {
      return
    }
    const isGroup = chatType === CONVERSATION_TYPE.GROUP_CHAT
    conversationStore.items.unshift({
      conversationId,
      chatType,
      name: isGroup ? groupDisplayNameOf(conversationId) : contactDisplayNameOf(conversationId),
      avatar: isGroup ? (groupStore.infoByGroupId[conversationId]?.avatar ?? '') : avatarOf(conversationId),
      unreadCount: 0,
      lastMessageText: '',
      lastMessageTime: 0,
      isPinned: false,
      pinnedTime: 0,
      isMuted: false
    })
  }

  // 群资料变更事件同步会话名（群域 hooks 注入，仅本地回写）
  updateConversationName(conversationId: string, name: string): void {
    const item = findConversation(conversationId)
    if (item != null && name !== '') {
      item.name = name
    }
  }

  // 清空聊天记录（聊天详情页）：漫游走 removeHistoryMessages 时间戳截断，本地清缓存并复位游标；
  // 会话列表该项摘要/时间清零（会话本身保留）
  async clearConversationMessages(conversationId: string, chatType: ConversationTypeValue): Promise<void> {
    const chatManager = await this.messages.readyChatManager()
    await chatManager.removeHistoryMessages({
      conversationId,
      conversationType: chatType,
      beforeTimestamp: Date.now()
    })
    // 清空进行中的流式合批缓冲/索引，防计时器把已清空的消息写回
    this.messages.forgetStreams(conversationId)
    if (messageStore.messagesByConversationId[conversationId] != null) {
      messageStore.messagesByConversationId[conversationId] = []
    }
    delete messageStore.cursorByConversationId[conversationId]
    delete messageStore.hasMoreByConversationId[conversationId]
    const item = findConversation(conversationId)
    if (item != null) {
      item.lastMessageText = ''
      item.lastMessageTime = 0
    }
  }

  // 实际删除后按本地剩余的最后一条重建摘要/时间；未加载列表不猜空，已加载空列表才清零
  syncMessageSummary(conversationId: string): void {
    const item = findConversation(conversationId)
    if (item == null) return
    const list = messageStore.messagesByConversationId[conversationId]
    if (list == null) return
    const latest = list.length > 0 ? list[list.length - 1] : null
    if (latest == null) {
      item.lastMessageText = ''
      item.lastMessageTime = 0
      return
    }
    const { t } = useLocale()
    let summary = t('message.unsupported')
    if (latest.status === MESSAGE_STATUS.RECALLED) {
      summary = t('message.recalledPreview')
    } else if (latest.type === MESSAGE_TYPE.TEXT || latest.type === MESSAGE_TYPE.NOTICE) {
      summary = latest.text
    } else if (latest.type === MESSAGE_TYPE.IMAGE) {
      summary = t('message.image')
    } else if (latest.type === MESSAGE_TYPE.AUDIO) {
      summary = t('message.audio')
    } else if (latest.type === MESSAGE_TYPE.VIDEO) {
      summary = t('message.video')
    } else if (latest.type === MESSAGE_TYPE.FILE) {
      summary = t('message.file')
    } else if (latest.type === MESSAGE_TYPE.CUSTOM) {
      summary = t('message.custom')
    }
    item.lastMessageText = summary
    item.lastMessageTime = latest.time
  }

  // 免打扰走 PushManager：设置 remindType NONE 为免打扰；
  // 恢复时 remindType 可设值不含 DEFAULT，须调 clearConversationRemindType 清除。
  // （'REMIND_TYPE'/'NONE' 为 SDK wire 枚举，按规范在边界处保留字面量）
  // 乐观回写最新意图；同会话请求串行，旧响应/失败不回写，最新失败回滚到已确认值。
  setConversationMuted(conversationId: string, chatType: ConversationTypeValue, muted: boolean): Promise<void> {
    const queue = this.muteQueueOf(conversationId)
    const item = findConversation(conversationId)
    if (item != null) {
      item.isMuted = muted
    }
    return this.enqueueSetting(queue, async () => {
      await this.messages.readyChatManager()
      const client = this.ctx.client as unknown as { pushManager?: PushManager } | null
      const push = client?.pushManager
      if (push == null) {
        throw new Error('PushManager not registered')
      }
      if (muted) {
        await push.setConversationSilentMode({
          conversationId,
          conversationType: chatType,
          rule: { mode: 'REMIND_TYPE', remindType: 'NONE' }
        })
      } else {
        await push.clearConversationRemindType({ conversationId, conversationType: chatType })
      }
      return muted
    }, (value) => {
      const current = findConversation(conversationId)
      if (current != null) {
        current.isMuted = value
      }
    })
  }

  private muteQueueOf(conversationId: string): ConversationSettingQueue<boolean> {
    const existing = this.muteQueueByConversationId[conversationId]
    if (existing != null) return existing
    const queue: ConversationSettingQueue<boolean> = {
      conversationId,
      generation: this.settingGenerationByConversationId[conversationId] ?? 0,
      accountGeneration: this.accountGeneration,
      tail: Promise.resolve(),
      latestRequestId: 0,
      settlementRevision: 0,
      pendingCount: 0,
      settledValue: findConversation(conversationId)?.isMuted ?? false
    }
    this.muteQueueByConversationId[conversationId] = queue
    return queue
  }

  // 会话列表快照不携带免打扰状态（SDK 快照恒为 DEFAULT / 群 joined-group 同步可能带入），
  // 以 PushManager 批量查询作为权威来源：单次最多 20 条，分片查询后逐条回写 store。
  // DURATION 规则无 remindType，按 expireTimestamp 未过期判定免打扰中（对齐 vue 版）。
  // 失败只告警：本地状态已由 toConversationItem 保留，不因一次网络失败把 icon 抹掉。
  async syncConversationMuteStates(expectedEpoch = getAccountEpoch()): Promise<void> {
    if (!isAccountEpochCurrent(expectedEpoch)) return
    const client = this.ctx.client as unknown as { pushManager?: PushManager } | null
    const push = client?.pushManager
    if (push == null) return
    const targets = conversationStore.items.map((c) => ({
      conversationId: c.conversationId,
      conversationType: c.chatType
    }))
    for (let i = 0; i < targets.length; i += CONVERSATION_SILENT_MODE_BATCH_SIZE) {
      const batch = targets.slice(i, i + CONVERSATION_SILENT_MODE_BATCH_SIZE)
      const requestIdByConversationId: Record<string, number> = {}
      const settlementRevisionByConversationId: Record<string, number> = {}
      batch.forEach((target) => {
        const queue = this.muteQueueByConversationId[target.conversationId]
        requestIdByConversationId[target.conversationId] = queue?.latestRequestId ?? 0
        settlementRevisionByConversationId[target.conversationId] = queue?.settlementRevision ?? 0
      })
      try {
        const result = await push.getConversationSilentModes({
          conversationList: batch
        })
        if (!isAccountEpochCurrent(expectedEpoch)) return
        result.conversations.forEach((r) => {
          if (!isAccountEpochCurrent(expectedEpoch)) return
          const queue = this.muteQueueByConversationId[r.conversationId]
          const requestId = requestIdByConversationId[r.conversationId] ?? 0
          const latestRequestId = queue?.latestRequestId ?? 0
          const settlementRevision = settlementRevisionByConversationId[r.conversationId] ?? 0
          // 查询发出后出现的新意图或本地结算优先，旧批量响应不得覆盖
          if (requestId !== latestRequestId || settlementRevision !== (queue?.settlementRevision ?? 0)) return
          const muted = r.rule.remindType === 'NONE'
            || (r.rule.expireTimestamp != null && r.rule.expireTimestamp > Date.now())
          if (queue != null) {
            queue.settledValue = muted
          }
          // 在途期间只更新回滚基线，保留当前乐观 UI
          const item = findConversation(r.conversationId)
          if ((queue?.pendingCount ?? 0) === 0 && item != null && item.isMuted !== muted) {
            item.isMuted = muted
          }
        })
      } catch (e) {
        logger.warn('syncConversationMuteStates failed:', e)
      }
    }
  }

  // 多设备会话事件（CONVERSATION_MUTE_INFO_CHANGED）：始终更新回滚基线，在途时保留乐观 UI
  applyMuteInfoChanged(conversationId: string, remindType: string | undefined): void {
    if (remindType == null || remindType === '') return
    const queue = this.muteQueueByConversationId[conversationId]
    const muted = remindType === 'NONE'
    if (queue != null) {
      queue.settledValue = muted
    }
    const item = findConversation(conversationId)
    if ((queue?.pendingCount ?? 0) === 0 && item != null) {
      item.isMuted = muted
    }
  }

  // 事件快照可能先于用户资料同步到达（conversationName 为空或等于 id），
  // 名称/头像在缺失时沿用前一次有效值，避免列表闪烁回 userId；
  // 群会话名称缺失时回落群数据层缓存（groupDisplayNameOf 自身再回落 groupId）
  // 免打扰同理：会话列表协议不携带该字段（SDK 快照恒为 DEFAULT），不能按快照重置，
  // 否则每次会话列表更新/回页同步都会把本地已标记的免打扰 icon 抹掉；
  // 已有会话保留本地状态，新会话才用快照兜底，权威校正见 syncConversationMuteStates。
  toConversationItem(
    c: ConversationItem,
    authoritativeRequestId?: number,
    authoritativeSettlementRevision?: number
  ): EmConversationItem {
    const prev = findConversation(c.conversationId)
    const chatType = mapWireChatType(c.conversationType as string)
    const validName = c.conversationName !== '' && c.conversationName !== c.conversationId
    const fallbackName = chatType === CONVERSATION_TYPE.GROUP_CHAT ? groupDisplayNameOf(c.conversationId) : c.conversationId
    const queue = this.pinQueueByConversationId[c.conversationId]
    const pinPending = (queue?.pendingCount ?? 0) > 0
    const staleRequest = authoritativeRequestId != null && authoritativeRequestId !== (queue?.latestRequestId ?? 0)
    const staleSettlement = authoritativeSettlementRevision != null && authoritativeSettlementRevision !== (queue?.settlementRevision ?? 0)
    const stale = staleRequest || staleSettlement
    // 在途或过期快照保留当前 UI；新鲜快照只更新回滚基线，不覆盖乐观意图
    const keepLocalPin = (pinPending || stale) && prev != null
    const hasSnapshotPin = c.isPinned != null
    const snapshotIsPinned = c.isPinned ?? (queue?.settledValue.isPinned ?? (prev != null ? prev.isPinned : false))
    const confirmedPinnedTime = queue?.settledValue.pinnedTime ?? (prev != null ? prev.pinnedTime : 0)
    const snapshotPinnedTime = snapshotIsPinned ? (c.pinnedTimestamp ?? confirmedPinnedTime) : 0
    if (!stale && queue != null && (hasSnapshotPin || !pinPending)) {
      queue.settledValue = { isPinned: snapshotIsPinned, pinnedTime: snapshotPinnedTime }
    }
    const isPinned = keepLocalPin ? prev.isPinned : snapshotIsPinned
    const pinnedTime = isPinned ? (keepLocalPin ? prev.pinnedTime : snapshotPinnedTime) : 0
    return {
      conversationId: c.conversationId,
      chatType,
      name: validName ? c.conversationName : (prev != null ? prev.name : fallbackName),
      avatar: (c.conversationAvatar ?? '') !== '' ? (c.conversationAvatar ?? '') : (prev != null ? prev.avatar : ''),
      unreadCount: c.unreadCount,
      lastMessageText: this.summaryOf(c.lastMessage),
      lastMessageTime: c.lastMessage?.timestamp ?? c.lastMessageAt ?? 0,
      isPinned,
      pinnedTime,
      isMuted: prev != null ? prev.isMuted : c.remindType === 'NONE'
    }
  }

  private summaryOf(last: SessionMessageSnippet | null): string {
    if (last == null) return ''
    const { t } = useLocale()
    // 5.x type 为 'image'/'voice'，4.x 遗风为 'img'/'audio'，统一按字符串兼容两种
    const type = (last.type ?? '') as string
    switch (type) {
      case 'text':
        return `${(last.body as Record<string, unknown>)['content'] ?? ''}`
      case 'img':
      case 'image':
        return t('message.image')
      case 'audio':
      case 'voice':
        return t('message.audio')
      case 'video':
        return t('message.video')
      case 'file':
        return t('message.file')
      case 'custom':
        return t('message.custom')
      case 'cmd':
        // typing 等信令不作为会话摘要展示
        return ''
      default:
        // refreshSessionList 的 lastMessage 存在 type='unknown' 但 body.content 有值的
        // wire 形态（实测：文本消息摘要拿到 unknown），兜底嗅探 content 当文本展示
        {
          const content = (last.body as Record<string, unknown>)['content']
          if (typeof content === 'string' && content !== '') {
            return content
          }
        }
        return t('message.unsupported')
    }
  }
}
