// 长按后抑制紧随其后的 click。
//
// H5 浏览器在 touchend 后一定会派发 click，而 uni-app 的 longpress 只是 350ms 定时器派发的
// 自定义事件（无 preventDefault、无 click 抑制）。于是「长按会话条目」会同时打开长按菜单并进入会话，
// 「长按图片」会同时打开菜单和图片预览，「长按语音」会同时开始播放。
//
// 解法定为「按本次触摸时长判定」而不是「longpress 标记位」：
// - touchstart 记录起点，click 时若按住时长 >= 350ms（即已经触发过 longpress）则吞掉本次 click；
// - 平台若原生抑制了 click，则根本不会调用到这里，也不存在标记位残留误伤下一次点击的问题；
// - 桌面鼠标/键盘触发的 click 没有 touchstart（起点为 0），正常放行。

const LONG_PRESS_MIN_MS = 350

export interface EmLongPressClickGuard {
  /** 绑到元素的 @touchstart */
  onTouchStart: () => void
  /** 在 @click 处理函数最前面调用；返回 true 表示这次 click 是长按抬手，应直接 return */
  shouldSkipClick: () => boolean
}

export function useLongPressClickGuard(): EmLongPressClickGuard {
  let touchStartAt = 0

  function onTouchStart(): void {
    touchStartAt = Date.now()
  }

  function shouldSkipClick(): boolean {
    const startedAt = touchStartAt
    touchStartAt = 0
    if (startedAt === 0) return false
    return Date.now() - startedAt >= LONG_PRESS_MIN_MS
  }

  return { onTouchStart, shouldSkipClick }
}
