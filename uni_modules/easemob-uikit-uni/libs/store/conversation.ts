import { computed, reactive } from 'vue'
import type { EmConversationItem, EmConversationPresentation } from '../types'

// 会话列表全局唯一 store（裸 reactive，零依赖）：
// atMeByConversationId 为「群里有人@我」未读标记（ext em_at_list 驱动，进入会话清除）；
// overrideByConversationId 为宿主业务注入（EmKit.setConversationPresentation）：name/avatar 优先于 SDK 会话快照，
// ext 随插槽 scope 透出；快照整量回写只重建 items，永不触碰 override
export const conversationStore = reactive({
  items: [] as EmConversationItem[],
  overrideByConversationId: {} as Record<string, EmConversationPresentation>,
  loaded: false,
  syncing: false,
  syncFailed: false,
  atMeByConversationId: {} as Record<string, boolean>
})

// 宿主业务注入：patch 按字段合并（undefined 不动现有值），null 清除该会话全部注入；空 id 忽略
export function setConversationPresentation(conversationId: string, patch: EmConversationPresentation | null): void {
  if (conversationId === '') return
  if (patch == null) {
    delete conversationStore.overrideByConversationId[conversationId]
    return
  }
  const next: EmConversationPresentation = { ...conversationStore.overrideByConversationId[conversationId] }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.avatar !== undefined) next.avatar = patch.avatar
  if (patch.ext !== undefined) next.ext = patch.ext
  conversationStore.overrideByConversationId[conversationId] = next
}

/**
 * 会话总未读数（底部 tabbar 角标等场景的响应式数据源）。
 * 口径：所有会话 unreadCount 之和，包含免打扰会话（微信/企微口径；免打扰只抑制提醒，不抹掉未读数）。
 * 宿主可直接 `computed(() => totalConversationUnread.value)` 或使用 useUnreadCounts()。
 */
export const totalConversationUnread = computed(() => {
  let total = 0
  // 禁用 for-of：App/鸿蒙编译会把 __values 辅助函数提升到别的 chunk（曾落在
  // components/pages/em-chat-page），使本 store 反向依赖页面组件，形成
  // store → page → libs/index → store 的 ESM 循环，鸿蒙首屏抛
  // "conversationStore is not initialized" 白屏（详见 skill em-crossend-pitfalls）
  conversationStore.items.forEach((item) => {
    if (item.unreadCount > 0) total += item.unreadCount
  })
  return total
})

/**
 * 单个会话的未读数（同步快照）：不存在/已清零返回 0。
 * 响应式场景用 useConversationUnreadCount(id)（computed），非 setup（原生回调/onLaunch）用本函数。
 * 口径与 totalConversationUnread 一致：含免打扰会话（免打扰只抑制提醒，不清零未读）。
 */
export function conversationUnreadCountOf(conversationId: string): number {
  if (conversationId === '') return 0
  const item = conversationStore.items.find((c) => c.conversationId === conversationId)
  return item != null && item.unreadCount > 0 ? item.unreadCount : 0
}

// 登出/换账号清空（会话列表、@我 标记与业务注入都是账号私有状态）
export function clearConversations(): void {
  conversationStore.items = []
  conversationStore.overrideByConversationId = {}
  conversationStore.loaded = false
  conversationStore.syncing = false
  conversationStore.syncFailed = false
  conversationStore.atMeByConversationId = {}
}
