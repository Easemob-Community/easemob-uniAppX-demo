// 原生 tabBar 角标同步（可选能力，宿主不接也不影响 UIKit）：
// 把 useUnreadCounts() 的响应式未读数落到 uni.setTabBarBadge / removeTabBarBadge。
//
// 用法（在任一 tab 页 setup 中调用；tab 页常驻，切到别的 tab 仍能收到更新）：
//   const badges = useTabBarBadge({ conversationIndex: 0, contactIndex: 1 })
//   onShow(() => badges.sync())   // 从二级页返回时补同步
// 自定义 tabBar / 不想用原生角标时，直接用 useUnreadCounts() 的 computed 渲染红点。
import { onMounted, watch } from 'vue'
import { getUnreadCounts, useUnreadCounts } from './useUnreadCounts'

export interface EmTabBarBadgeOptions {
  /** 总开关，默认 true */
  enabled?: boolean
  /** 「会话」tab 下标，默认 0 */
  conversationIndex?: number
  /** 「联系人」tab 下标，默认 1 */
  contactIndex?: number
  /** 是否给会话 tab 挂角标，默认 true */
  showConversationBadge?: boolean
  /** 是否给联系人 tab 挂角标，默认 true */
  showContactBadge?: boolean
  /** 角标封顶值，超过显示「N+」，默认 99 */
  maxCount?: number
}

function formatBadge(count: number, maxCount: number): string {
  return count > maxCount ? `${maxCount}+` : String(count)
}

function applyBadge(index: number, count: number, maxCount: number): void {
  if (typeof uni === 'undefined') return
  try {
    if (count > 0) {
      uni.setTabBarBadge({ index, text: formatBadge(count, maxCount), fail: () => {} })
    } else {
      // 无角标时移除；tab 尚未就绪/本来就没有角标会走 fail，忽略即可
      uni.removeTabBarBadge({ index, fail: () => {} })
    }
  } catch (e) {
    // 非 tab 页或平台未实现时静默：不影响业务
  }
}

/**
 * 非组合式一次性同步（登录成功回到 tab 页后、宿主自定义刷新点可用）。
 * 注意：原生 setTabBarBadge 要求「当前页是 tabBar 页」，在聊天页/二级页调用会被平台拒绝；
 * 宿主需在 tab 页 onShow 调一次返回的 sync() 补同步（组合式版本只自动挂 onMounted + watch）。
 */
export function syncTabBarBadges(options: EmTabBarBadgeOptions = {}): void {
  if (options.enabled === false) return
  const maxCount = Math.max(1, options.maxCount ?? 99)
  const { conversationUnread, contactRequestUnread } = getUnreadCounts()
  if (options.showConversationBadge !== false) {
    applyBadge(options.conversationIndex ?? 0, conversationUnread, maxCount)
  }
  if (options.showContactBadge !== false) {
    applyBadge(options.contactIndex ?? 1, contactRequestUnread, maxCount)
  }
}

export interface EmTabBarBadgeController {
  /** 立即按当前 store 快照重同步（tab 页 onShow 时调用，补上二级页期间被平台拒绝的写入） */
  sync: () => void
}

/**
 * 响应式把未读数同步到原生 tabBar 角标；在 tab 页 setup 中调用一次即可。
 * 内部 watch 会话/联系人未读 computed，SDK 事件驱动更新后自动 setTabBarBadge/removeTabBarBadge。
 * 返回 { sync }：宿主在 tab 页 onShow 调一次，补上「在聊天页收到消息 → 返回 tab 页」的角标。
 * （库内不 import @dcloudio/uni-app 的 onShow：uni-app x 的库侧类型面不导出该生命周期）
 */
export function useTabBarBadge(options: EmTabBarBadgeOptions = {}): EmTabBarBadgeController {
  const enabled = options.enabled !== false
  const maxCount = Math.max(1, options.maxCount ?? 99)
  const conversationIndex = options.conversationIndex ?? 0
  const contactIndex = options.contactIndex ?? 1
  const showConversation = options.showConversationBadge !== false
  const showContact = options.showContactBadge !== false
  const { conversationUnread, contactRequestUnread } = useUnreadCounts()

  function sync(): void {
    if (!enabled) return
    if (showConversation) applyBadge(conversationIndex, conversationUnread.value, maxCount)
    if (showContact) applyBadge(contactIndex, contactRequestUnread.value, maxCount)
  }

  onMounted(sync)
  watch([conversationUnread, contactRequestUnread], sync)
  return { sync }
}
