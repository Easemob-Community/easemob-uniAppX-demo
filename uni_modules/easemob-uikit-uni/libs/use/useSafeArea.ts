import { ref } from 'vue'
import type { Ref } from 'vue'

// 安全区 composable（PLAN use/ 规划位）：底部 Home 指示条 / 顶部刘海 inset 的统一读取入口。
// uni.getWindowInfo().safeAreaInsets 在 H5 上可能缺失，兜底 0。
// 注意是读取时刻快照，不响应旋转（一期无横屏需求）

export function getSafeAreaBottom(): number {
  return uni.getWindowInfo().safeAreaInsets?.bottom ?? 0
}

export function getSafeAreaTop(): number {
  return uni.getWindowInfo().safeAreaInsets?.top ?? 0
}

export interface UseSafeAreaResult {
  bottom: Ref<number>
  top: Ref<number>
}

export function useSafeArea(): UseSafeAreaResult {
  return {
    bottom: ref(getSafeAreaBottom()),
    top: ref(getSafeAreaTop())
  }
}
