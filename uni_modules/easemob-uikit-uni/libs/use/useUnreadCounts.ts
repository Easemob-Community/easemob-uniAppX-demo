// 未读数组合式能力：把会话总未读 / 联系人请求未读 / 单会话未读收敛成响应式 computed，
// 供底部 tabbar 角标、自定义 tabbar、首页红点、业务入口角标等宿主消费（不反向依赖任何 UI 组件）。
import { computed, unref } from 'vue'
import type { ComputedRef, MaybeRef } from 'vue'
import { contactRequestUnreadCount } from '../store/contact'
import { conversationUnreadCountOf, totalConversationUnread } from '../store/conversation'

export interface EmUnreadCounts {
  /** 会话总未读（含免打扰会话，口径同微信 tabbar） */
  conversationUnread: ComputedRef<number>
  /** 联系人请求未读（收到的、仍 pending 的好友申请/群邀请） */
  contactRequestUnread: ComputedRef<number>
}

/**
 * 响应式未读数（必须在组件 setup / computed / watch 中使用）：
 *   const { conversationUnread, contactRequestUnread } = useUnreadCounts()
 *   watch(conversationUnread, n => ...)
 *
 * 数据源是模块级 reactive store，SDK 事件驱动更新后 computed 自动重算，
 * 无需宿主轮询或手动 refresh。
 */
export function useUnreadCounts(): EmUnreadCounts {
  return {
    conversationUnread: totalConversationUnread,
    contactRequestUnread: contactRequestUnreadCount
  }
}

/** 非 setup 场景（App onLaunch、原生回调、日志等）的一次性快照；需要持续更新请用 useUnreadCounts() */
export function getUnreadCounts(): { conversationUnread: number, contactRequestUnread: number } {
  return {
    conversationUnread: totalConversationUnread.value,
    contactRequestUnread: contactRequestUnreadCount.value
  }
}

/**
 * 单个会话的响应式未读数（业务入口角标：客服/卖家/HR 未读）：
 *   const unread = useConversationUnreadCount(peerUserId)          // 固定对端
 *   const unread = useConversationUnreadCount(conversationIdRef)   // 动态会话（ref）
 *   <em-badge :count="unread" />
 */
export function useConversationUnreadCount(conversationId: MaybeRef<string>): ComputedRef<number> {
  return computed(() => conversationUnreadCountOf(unref(conversationId)))
}
