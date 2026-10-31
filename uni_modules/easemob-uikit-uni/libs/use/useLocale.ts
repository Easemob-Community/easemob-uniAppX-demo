import { reactive } from 'vue'
import { themeStore } from '../store/theme'
import { LOCALE } from '../constants'
import type { EmLocaleName } from '../types'
import { getStorage, setStorage } from '../platform'
import zhCN from '../locale/zh-CN'
import en from '../locale/en'

/** 语言偏好的本地持久化 key（与主题偏好 emkit.themeMode 并列） */
export const LOCALE_STORAGE_KEY = 'emkit.locale'

// 文案表为可变 store（reactive）：zh-CN/en 为初始值，业务方可经 mergeMessages 运行时
// 注入新语言或覆盖既有文案（i18n 注入口）；t() 读取口径与 key 不变
const messages = reactive<Record<string, Record<string, string>>>({
  [LOCALE.ZH_CN]: { ...zhCN },
  [LOCALE.EN]: { ...en }
})

/** 运行时合并文案表：同 locale 浅合并（覆盖同 key），新 locale 直接挂载 */
export function mergeMessages(locale: EmLocaleName, table: Record<string, string>): void {
  messages[locale] = { ...(messages[locale] ?? {}), ...table }
}

/** 系统语言 → 内置 locale：英文环境用 en，其余回落 zh-CN（与 vue 版默认一致） */
function detectSystemLocale(): EmLocaleName {
  try {
    const language = (uni.getSystemInfoSync().language ?? '').toLowerCase()
    return language.indexOf('en') === 0 ? LOCALE.EN : LOCALE.ZH_CN
  } catch (e) {
    return LOCALE.ZH_CN
  }
}

/**
 * 初始化语言偏好：优先本地持久化值，其次系统语言；幂等（宿主在 App onLaunch 调一次即可）。
 * 已注册的自定义 locale 也可恢复；只有本地值没有对应文案表时才回退系统语言。
 */
export function initLocale(): EmLocaleName {
  const saved = getStorage(LOCALE_STORAGE_KEY)
  const next = messages[saved] != null ? saved : detectSystemLocale()
  themeStore.locale = next
  return next
}

/** 设置语言并持久化（默认持久化；临时切换可传 false） */
export function setLocale(locale: EmLocaleName, persist = true): void {
  themeStore.locale = locale
  if (persist) setStorage(LOCALE_STORAGE_KEY, locale)
}

export function getLocale(): EmLocaleName {
  return themeStore.locale
}

// 首次 import 即恢复偏好；幂等，后续 initLocale 不会重复写 storage
initLocale()

// i18n composable：t(key) 查扁平表，支持 {name} 插值；
// 缺 key 回退 zh-CN，再回退 key 本身。文案无硬编码，组件内一律走 t()
export function useLocale() {
  function t(key: string, params?: Record<string, string | number>): string {
    const table = messages[themeStore.locale]
    let text = table[key]
    if (text == null) text = messages[LOCALE.ZH_CN][key]
    if (text == null) return key
    if (params != null) {
      Object.keys(params).forEach((name) => {
        text = (text as string).replace(`{${name}}`, `${params[name]}`)
      })
    }
    return text
  }

  return { t, setLocale, getLocale }
}
