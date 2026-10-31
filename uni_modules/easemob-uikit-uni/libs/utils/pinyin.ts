import { ALPHABET_KEYS } from '../constants'
import type { EmContactItem } from '../types'

// 字母分组与索引条工具（对齐 vue 版 use-pinyin / use-contact-group / alphabet-nav.utils 设计）：
// 拼音为可选注入——零运行时依赖纪律下不打包拼音库，业务侧可用 pinyin-pro 等经
// setPinyinAdapter 接入；未注入时非 A-Z 首字符全部落 '#' 组、搜索仅原文匹配
// （与 vue 版未注入 adapter 的默认降级行为一致）

export interface EmPinyinResult {
  pinyin: string       // 完整拼音（无声调，如 'zhangsan'）
  initials: string     // 首字母缩写（如 'zs'）
  firstLetter: string  // 首字母大写（如 'Z'）
}

type PinyinAdapter = (text: string) => EmPinyinResult

let adapter: PinyinAdapter | null = null

export function setPinyinAdapter(a: PinyinAdapter | null): void {
  adapter = a
}

// 分组 key：展示名首字符大写，A-Z 归组；有 adapter 时用 firstLetter；其余落 '#'
export function groupKeyOf(name: string): string {
  if (name === '') return '#'
  const ch = name.charAt(0).toUpperCase()
  if (ch >= 'A' && ch <= 'Z') return ch
  if (adapter != null) {
    try {
      const letter = adapter(name).firstLetter.toUpperCase()
      if (letter >= 'A' && letter <= 'Z') return letter
    } catch (e) {
      // adapter 异常降级为 '#'
    }
  }
  return '#'
}

// 组内排序：有 adapter 按完整拼音 localeCompare，否则原文小写 localeCompare
function sortKeyOf(name: string): string {
  if (adapter != null) {
    try {
      return adapter(name).pinyin
    } catch (e) {
      // adapter 异常降级原文
    }
  }
  return name.toLowerCase()
}

export interface EmContactGroup<T = EmContactItem> {
  key: string
  items: T[]
}

// 分组：按 ALPHABET_KEYS 顺序输出，空组剔除；组内排序
export function groupContacts<T extends { userId: string }>(list: T[], nameOf: (c: T) => string): EmContactGroup<T>[] {
  const buckets = new Map<string, T[]>()
  list.forEach((c) => {
    const key = groupKeyOf(nameOf(c))
    const bucket = buckets.get(key)
    if (bucket != null) {
      bucket.push(c)
    } else {
      buckets.set(key, [c])
    }
  })
  const groups: EmContactGroup<T>[] = []
  ALPHABET_KEYS.forEach((key) => {
    const items = buckets.get(key)
    if (items == null || items.length === 0) return
    items.sort((a, b) => sortKeyOf(nameOf(a)).localeCompare(sortKeyOf(nameOf(b))))
    groups.push({ key, items })
  })
  return groups
}

// 搜索命中：展示名/userId 原文包含（不区分大小写）；有 adapter 时追加完整拼音与首字母缩写命中
export function matchContact(c: EmContactItem, name: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (kw === '') return true
  if (name.toLowerCase().includes(kw)) return true
  if (c.userId.toLowerCase().includes(kw)) return true
  if (adapter != null) {
    try {
      const p = adapter(name)
      if (p.pinyin.toLowerCase().includes(kw)) return true
      if (p.initials.toLowerCase().includes(kw)) return true
    } catch (e) {
      // adapter 异常忽略拼音通道
    }
  }
  return false
}

// 索引条滑动定位：触点 y 占索引条高度比例映射到字母序列，越界钳制首末
// （微信通讯录式按占比映射而非逐格命中，对齐 vue 版 resolveAlphabetKeyByOffsetY）
export function resolveAlphabetKeyByOffsetY(offsetY: number, containerHeight: number, keys: string[]): string {
  if (keys.length === 0 || containerHeight <= 0) return ''
  const ratio = offsetY / containerHeight
  let index = Math.floor(ratio * keys.length)
  if (index < 0) index = 0
  if (index >= keys.length) index = keys.length - 1
  return keys[index]
}
