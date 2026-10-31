// em-text 内联文字样式共享常量（收敛各组件 nameTextStyle/subtitleTextStyle 拷贝）：
// 小程序样式隔离下父组件 wxss 够不到 em-text 内部 text，文字样式必须 text-class + text-style 双通道
// （详见 em-text 注释）；单行折叠档必须带 white-space: nowrap（mp-weixin 不认 lines 属性，缺 nowrap
// 会被固定行高拦腰裁切）。
export const TEXT_STYLE_NAME =
  'font-family: var(--em-font-family); font-size: var(--em-font-size-15); font-weight: var(--em-font-weight-semibold); line-height: 20px; color: var(--em-text-primary); white-space: nowrap;'

export const TEXT_STYLE_SUBTITLE =
  'font-family: var(--em-font-family); font-size: var(--em-font-size-13); line-height: 18px; color: var(--em-text-secondary); white-space: nowrap;'
