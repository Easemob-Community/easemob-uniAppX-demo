// z-index 运行时递增分配器（基准 2000），模块级计数器；
// 弹层类组件（em-popup 及上层）open 时各取一个新值，保证后开者在上

const Z_INDEX_BASE = 2000
let zIndexSeed = Z_INDEX_BASE

export function nextZIndex(): number {
  zIndexSeed += 1
  return zIndexSeed
}

// 小程序/App 的原生 tabBar 渲染在页面层之上，页面内弹层（无论 z-index 多高）都盖不住，
// 只能弹层打开时 hideTabBar、全部关闭后 showTabBar。模块级计数器防嵌套弹层中途闪回。
// H5 的 tabBar 是 DOM 内组件，弹层可直接覆盖，无需处理。
let tabBarHoldCount = 0

export function holdTabBar(): void {
  // #ifdef MP-WEIXIN || APP
  tabBarHoldCount += 1
  if (tabBarHoldCount === 1) {
    uni.hideTabBar({ animation: false, fail: () => {} })
  }
  // #endif
}

export function releaseTabBar(): void {
  // #ifdef MP-WEIXIN || APP
  // 没人持锁时直接返回：不能用 Math.max(0, n-1) 兜底——那会在计数为 0 时也调 showTabBar，
  // 把「另一个弹层仍开着」的 tabBar 提前放回来（弹层组件初次挂载时最容易踩到）
  if (tabBarHoldCount === 0) return
  tabBarHoldCount -= 1
  if (tabBarHoldCount === 0) {
    uni.showTabBar({ animation: false, fail: () => {} })
  }
  // #endif
}
