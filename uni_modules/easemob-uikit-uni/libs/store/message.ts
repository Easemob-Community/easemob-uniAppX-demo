import { reactive } from 'vue'
import type { EmMessageItem, EmPinnedMessageItem } from '../types'

// 消息按会话分组的全局唯一 store（裸 reactive，零依赖）
// keyed Record 一律 <值>By<key> 命名（AGENTS.md §4 状态命名约定），禁止裸 map/data
export const messageStore = reactive({
  messagesByConversationId: {} as Record<string, EmMessageItem[]>,
  cursorByConversationId: {} as Record<string, string>,
  hasMoreByConversationId: {} as Record<string, boolean>,
  // 置顶消息按会话分组（M2.20）：pinnedAt 降序（最新置顶在前），服务端上限 20 条
  pinnedByConversationId: {} as Record<string, EmPinnedMessageItem[]>,
  // 对端已读时间戳（会话级，单聊已读回执驱动）
  peerReadTimeByConversationId: {} as Record<string, number>,
  // 对端 typing 状态（超时由 chat 层定时器清除）
  peerTypingByConversationId: {} as Record<string, boolean>
})

export function getMessages(conversationId: string): EmMessageItem[] {
  if (messageStore.messagesByConversationId[conversationId] == null) {
    messageStore.messagesByConversationId[conversationId] = []
  }
  return messageStore.messagesByConversationId[conversationId]
}

// 登出/换账号清空（消息是账号私有数据，不能留给下一个登录者）
export function clearMessages(): void {
  messageStore.messagesByConversationId = {}
  messageStore.cursorByConversationId = {}
  messageStore.hasMoreByConversationId = {}
  messageStore.pinnedByConversationId = {}
  messageStore.peerReadTimeByConversationId = {}
  messageStore.peerTypingByConversationId = {}
}
