import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { THEME_MODE } from '../constants'
import { getStorage, setStorage } from '../platform'
import { themeStore } from '../store/theme'
import type { EmThemeMode, EmThemePreference } from '../types'

// 主题引擎：偏好（auto/light/dark）持久化 + 系统主题读取/监听 + 解析后的 themeClass。
// - auto（默认）：App 跟随 osTheme，Web 跟随 prefers-color-scheme，小程序跟随 hostTheme；
// - light/dark：宿主强制；App 端同步 uni.setAppTheme，让原生弹窗等系统 UI 一起跟随；
// - themeClass 仍由页面级组件根节点绑定（App 端无 :root，RiceUI trick 不变）。

/** 主题偏好持久化 key（设备级，不随账号登出清理） */
export const THEME_STORAGE_KEY = 'emkit.themeMode'

export interface EmThemeInitOptions {
  /** 用户偏好；不传则读取持久化值，缺省 auto 跟随系统 */
  mode?: EmThemePreference
  /** 宿主 tabBar 页面路由（不含前导 /）；命中当前页时才同步原生 tabBar，避免非 tab 页 API 报错 */
  tabBarPages?: string[]
}

export interface EmThemeSyncOptions {
  /** 是否同步原生导航栏（默认 true） */
  navigationBar?: boolean
  /** 是否强制同步原生 tabBar（默认 false，仅当前页命中 tabBarPages 时同步） */
  tabBar?: boolean
}

let initialized = false
let tabBarPages: string[] = []

function normalizePreference(value: string): EmThemePreference {
  if (value === THEME_MODE.LIGHT || value === THEME_MODE.DARK || value === THEME_MODE.AUTO) {
    return value
  }
  return THEME_MODE.AUTO
}

/** 读系统当前主题；各端能力不同，读不到时回落 light（不抛错） */
function readSystemTheme(): EmThemeMode {
  // #ifdef WEB
  try {
    // H5 运行时未必实现 uni.getAppBaseInfo().hostTheme，直接用浏览器媒体查询（与系统同步且零配置）
    const win: any = window as any
    if (win != null && typeof win.matchMedia === 'function') {
      return win.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_MODE.DARK : THEME_MODE.LIGHT
    }
  } catch (e) {}
  // #endif

  // #ifdef MP-WEIXIN
  try {
    // manifest.json 的 mp-weixin.darkmode=true 才有 hostTheme（否则 undefined → light）
    const info: any = uni.getAppBaseInfo()
    if (info != null && info.hostTheme === THEME_MODE.DARK) {
      return THEME_MODE.DARK
    }
  } catch (e) {}
  // #endif

  // #ifdef APP
  try {
    // App 端系统主题通过 getDeviceInfo().osTheme 读取（getAppBaseInfo().theme 仅小程序有值）
    const info: any = uni.getDeviceInfo()
    if (info != null && info.osTheme === THEME_MODE.DARK) {
      return THEME_MODE.DARK
    }
  } catch (e) {}
  // #endif

  return THEME_MODE.LIGHT
}

/** 按偏好与系统主题算出生效主题，并回写 store（App 端顺带同步 appTheme） */
function applyResolvedTheme(): void {
  const preference = themeStore.preference
  themeStore.mode =
    preference === THEME_MODE.AUTO
      ? themeStore.systemMode
      : preference === THEME_MODE.DARK
        ? THEME_MODE.DARK
        : THEME_MODE.LIGHT

  // #ifdef APP
  try {
    // appTheme 驱动原生 UI（showModal、pages.json 原生导航栏等）；auto 时由系统决定
    uni.setAppTheme({ theme: preference, success: () => {}, fail: () => {} })
  } catch (e) {}
  // #endif

  // #ifdef WEB
  try {
    // H5 没有 setNavigationBarColor：把生效主题挂到 <html>，宿主的全局 CSS 可覆盖
    // uni 内置导航栏（demo/index.html 的 .uni-page-head 规则消费该属性）
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-em-theme', themeStore.mode)
    }
  } catch (e) {}
  // #endif
}

function applySystemTheme(mode: EmThemeMode): void {
  if (themeStore.systemMode === mode) {
    return
  }
  themeStore.systemMode = mode
  if (themeStore.preference === THEME_MODE.AUTO) {
    applyResolvedTheme()
  }
}

/** 订阅系统主题变化（App onOsThemeChange / 小程序 onHostThemeChange / Web matchMedia）；只订阅一次 */
function subscribeSystemTheme(): void {
  // #ifdef WEB
  try {
    const win: any = window as any
    if (win != null && typeof win.matchMedia === 'function') {
      const mql: any = win.matchMedia('(prefers-color-scheme: dark)')
      const handler = (event: any) => {
        applySystemTheme(event != null && event.matches === true ? THEME_MODE.DARK : THEME_MODE.LIGHT)
      }
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler)
      } else if (typeof mql.addListener === 'function') {
        // 旧版 Safari 只有 addListener
        mql.addListener(handler)
      }
    }
  } catch (e) {}
  // #endif

  // #ifdef MP-WEIXIN
  try {
    uni.onHostThemeChange((result) => {
      applySystemTheme(result.hostTheme === 'dark' ? THEME_MODE.DARK : THEME_MODE.LIGHT)
    })
  } catch (e) {
    // 低版本基础库没有 onHostThemeChange，回落经典 onThemeChange
    try {
      uni.onThemeChange((result) => {
        applySystemTheme(result.theme === 'dark' ? THEME_MODE.DARK : THEME_MODE.LIGHT)
      })
    } catch (e2) {}
  }
  // #endif

  // #ifdef APP
  try {
    uni.onOsThemeChange((result) => {
      applySystemTheme(result.osTheme === 'dark' ? THEME_MODE.DARK : THEME_MODE.LIGHT)
    })
  } catch (e) {}
  // #endif
}

/**
 * 初始化主题引擎（幂等；App onLaunch 调用一次即可）。
 * 首次调用读取持久化偏好 + 系统主题并订阅系统变化；重复调用只合并 tabBarPages / mode。
 */
export function initTheme(options?: EmThemeInitOptions): void {
  if (options != null && options.tabBarPages != null) {
    tabBarPages = [...options.tabBarPages]
  }

  if (initialized) {
    if (options != null && options.mode != null && options.mode !== themeStore.preference) {
      setTheme(options.mode)
    }
    return
  }
  initialized = true

  if (options != null && options.mode != null) {
    themeStore.preference = options.mode
  } else {
    themeStore.preference = normalizePreference(getStorage(THEME_STORAGE_KEY))
  }
  themeStore.systemMode = readSystemTheme()
  applyResolvedTheme()
  subscribeSystemTheme()
}

/** 设置主题偏好（auto/light/dark）：写 store + 持久化 + 立即重算生效主题 */
export function setTheme(mode: EmThemePreference): void {
  initTheme()
  themeStore.preference = mode
  setStorage(THEME_STORAGE_KEY, mode)
  applyResolvedTheme()
}

/** 读取实际生效的明暗主题 */
export function getTheme(): EmThemeMode {
  initTheme()
  return themeStore.mode
}

/**
 * 同步原生导航栏 / tabBar 颜色。页面 onShow 与主题变化时调用；
 * 原生 UI 不随页面根节点 class 变化，必须走 uni API（H5 无原生导航栏，自动跳过）。
 */
export function syncNativeThemeUI(options?: EmThemeSyncOptions): void {
  const dark = themeStore.mode === THEME_MODE.DARK
  const wantNavigationBar = options == null || options.navigationBar !== false

  if (wantNavigationBar) {
    // #ifndef WEB
    try {
      // 自定义导航栏页面调用无功无过（平台可能 reject），失败静默
      const ret: any = uni.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#1E2123' : '#FFFFFF'
      })
      if (ret != null && typeof ret.catch === 'function') {
        ret.catch(() => {})
      }
    } catch (e) {}
    // #endif
  }

  let wantTabBar = options != null && options.tabBar === true
  // #ifndef WEB
  if (!wantTabBar && tabBarPages.length > 0) {
    try {
      const pages: any[] = getCurrentPages() as any[]
      const current: any = pages.length > 0 ? pages[pages.length - 1] : null
      const route = (current != null ? current.route : '') as string
      wantTabBar = route !== '' && tabBarPages.indexOf(route) >= 0
    } catch (e) {}
  }
  // #endif
  if (!wantTabBar) {
    return
  }

  // #ifndef WEB
  try {
    const ret: any = uni.setTabBarStyle({
      color: dark ? '#9AA0A6' : '#919BA1',
      selectedColor: '#009EFF',
      backgroundColor: dark ? '#1E2123' : '#FFFFFF',
      borderStyle: dark ? 'black' : 'white'
    })
    if (ret != null && typeof ret.catch === 'function') {
      ret.catch(() => {})
    }
  } catch (e) {}
  // #endif
}

// 主题 composable：themeClass 供页面级组件根节点绑定；setTheme 支持 auto/light/dark
export function useTheme() {
  initTheme()

  const themeClass: ComputedRef<string> = computed(() => `em-theme-${themeStore.mode}`)
  const isDark: ComputedRef<boolean> = computed(() => themeStore.mode === THEME_MODE.DARK)

  function getThemeMode(): EmThemeMode {
    return themeStore.mode
  }

  return { themeStore, themeClass, isDark, setTheme, getTheme: getThemeMode }
}
