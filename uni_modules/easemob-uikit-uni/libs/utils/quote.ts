// 引用（quote）展示映射纯函数：聊天页引用卡与输入栏引用条共用，收敛两处拷贝（行为不变，依赖注入）：
// - 摘要/发送人文案依赖 locale 与用户信息 store，以函数参数注入（本文件不反向依赖 use/store）
// - 类名由调用方传入（引用卡与引用条的宿主 class 不同），避免 utils 反向依赖组件命名
import { MESSAGE_TYPE } from '../constants'
import type { EmQuoteInfo } from '../types'
import type { EmIconName } from '../../components/em-icon/em-icons'

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

/** 摘要后缀（冒号按 locale 的 summary 模板拼，发送人单列以便套 medium 字重） */
export function quoteSuffixOf(q: EmQuoteInfo | null, t: TranslateFn): string {
  if (q == null) return ''
  return t('message.quote.summary', { from: '', text: q.text })
}

/** 引用发送者展示名：优先用发送时快照 fromName（跨端/离线也能显示昵称），老数据回落 userId 查资料 */
export function quoteSenderOf(q: EmQuoteInfo | null, displayName: (userId: string) => string): string {
  if (q == null) return ''
  if (q.fromName != null && q.fromName !== '') return q.fromName
  return q.from !== '' ? displayName(q.from) : ''
}

/** 引用文字 class：base + 可选 self 修饰（类名由调用方传入，引用卡与引用条宿主不同） */
export function quoteTextClassOf(self: boolean, baseClass: string, selfClass: string): string {
  return self ? `${baseClass} ${selfClass}` : baseClass
}

/** 引用文字内联样式基串（小程序样式隔离，见 em-text 注释） */
export const QUOTE_TEXT_STYLE_BASE =
  'font-family: var(--em-font-family); font-size: var(--em-font-size-13); line-height: 18px; color: var(--em-text-secondary);'

/** 引用文字内联样式：己方追加右对齐 */
export function quoteTextStyleOf(self: boolean): string {
  return self ? `${QUOTE_TEXT_STYLE_BASE} text-align: right;` : QUOTE_TEXT_STYLE_BASE
}

/** 非文本引用在文本流开头带类型图标（引用卡文本不带；引用条文本走 circle-quote，见调用方） */
export function quoteHasIcon(type: string | undefined): boolean {
  return type === MESSAGE_TYPE.IMAGE || type === MESSAGE_TYPE.VIDEO || type === MESSAGE_TYPE.AUDIO || type === MESSAGE_TYPE.FILE
}

/**
 * 引用类型图标 —— 逐项对齐 vue 版 quote-bar.vue / quote-card.vue 的 typeIcon 映射：
 * image → file/img、video → file/video、voice → mic、file → doc；
 * 引用条文本类型回落 circle/quote（引用卡不渲染文本图标）。
 */
export function quoteIconNameOf(type: string | undefined): EmIconName {
  if (type === MESSAGE_TYPE.IMAGE) return 'file-img'
  if (type === MESSAGE_TYPE.VIDEO) return 'file-video'
  if (type === MESSAGE_TYPE.AUDIO) return 'mic'
  if (type === MESSAGE_TYPE.FILE) return 'doc'
  return 'circle-quote'
}
