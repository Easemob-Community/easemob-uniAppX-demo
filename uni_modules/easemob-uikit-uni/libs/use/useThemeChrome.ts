import { onShow } from '@dcloudio/uni-app'
import { watch } from 'vue'
import { THEME_MODE } from '../constants'
import { themeStore } from '../store/theme'
import { initTheme, syncNativeThemeUI, useTheme } from './useTheme'

export interface EmThemeChromeColors {
  lightBackground?: string
  darkBackground?: string
  lightForeground?: string
  darkForeground?: string
  lightTabText?: string
  darkTabText?: string
  selectedTabText?: string
  lightTabBorder?: string
  darkTabBorder?: string
}

export interface EmThemeChromeOptions {
  tabBarPages: string[]
  colors?: EmThemeChromeColors
}

const DEFAULT_COLORS: Required<EmThemeChromeColors> = {
  lightBackground: '#FFFFFF',
  darkBackground: '#1E2123',
  lightForeground: '#171A1C',
  darkForeground: '#FFFFFF',
  lightTabText: '#919BA1',
  darkTabText: '#9AA0A6',
  selectedTabText: '#009EFF',
  lightTabBorder: 'rgba(0, 0, 0, 0.33)',
  darkTabBorder: '#333537'
}

function currentRoute(): string {
  // #ifdef WEB
  try {
    const hash: string = (window as any).location.hash as string
    return hash.replace(/^#\/?/, '')
  } catch (e) {
    return ''
  }
  // #endif
  // #ifndef WEB
  return ''
  // #endif
}

// #ifdef WEB
// H5 原生 tabBar 深色染色的持久化守护（进程级单例）。
// 背景：uni-app x 的 H5 runtime 未实现 uni.setTabBarStyle；tabBar 文字色是 Vue 响应式
// 内联绑定（颜色状态只来自 pages.json 浅色配置，选中 label 无区分 class），切 tab 时
// selectedIndex 变化触发重渲染，用浅色值重绑内联样式，把 syncH5Chrome 的一次性覆盖冲掉。
// 这里观察 body 子树中触及 .uni-tabbar 的变化（label 重绑/整棵重挂载），微任务补染；
// 写回同值不产生 mutation record，不会自激。
let h5TabBarObserver: MutationObserver | null = null
let h5TabBarSyncScheduled = false

function isTabBarRelated(record: MutationRecord): boolean {
  const target = record.target as HTMLElement
  if (target != null && typeof target.closest === 'function' && target.closest('.uni-tabbar') != null) {
    return true
  }
  if (record.type === 'childList') {
    const nodes = record.addedNodes.length > 0 ? record.addedNodes : record.removedNodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as HTMLElement
      if (node != null && typeof node.querySelector === 'function' &&
          (node.classList?.contains('uni-tabbar') || node.querySelector('.uni-tabbar') != null)) {
        return true
      }
    }
  }
  return false
}

function ensureH5TabBarObserver(onMutate: () => void): void {
  try {
    if (h5TabBarObserver != null || typeof document === 'undefined') {
      return
    }
    h5TabBarObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if (isTabBarRelated(record)) {
          onMutate()
        }
      })
    })
    h5TabBarObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    })
  } catch (e) {}
}
// #endif

export function useThemeChrome(options: EmThemeChromeOptions) {
  initTheme({ tabBarPages: options.tabBarPages })
  const colors: Required<EmThemeChromeColors> = { ...DEFAULT_COLORS, ...options.colors }

  function syncH5Chrome(): void {
    // #ifdef WEB
    try {
      const dark = themeStore.mode === THEME_MODE.DARK
      const background = dark ? colors.darkBackground : colors.lightBackground
      const head: any = document.querySelector('.uni-page-head')
      if (head != null) {
        head.style.backgroundColor = background
        head.style.color = dark ? colors.darkForeground : colors.lightForeground
      }
      const bar: any = document.querySelector('.uni-tabbar')
      if (bar != null) bar.style.backgroundColor = background
      const border: any = document.querySelector('.uni-tabbar-border')
      if (border != null) border.style.backgroundColor = dark ? colors.darkTabBorder : colors.lightTabBorder
      const route = currentRoute()
      const labels: any = document.querySelectorAll('.uni-tabbar__label')
      for (let i = 0; i < labels.length; i++) {
        const label: any = labels[i]
        const active = i < options.tabBarPages.length && options.tabBarPages[i] === route
        label.style.color = active ? colors.selectedTabText : dark ? colors.darkTabText : colors.lightTabText
      }
    } catch (e) {}
    // #endif
  }

  // #ifdef WEB
  function scheduleSyncH5Chrome(): void {
    if (h5TabBarSyncScheduled) {
      return
    }
    h5TabBarSyncScheduled = true
    setTimeout(() => {
      h5TabBarSyncScheduled = false
      syncH5Chrome()
    }, 0)
  }
  // #endif

  function syncChrome(): void {
    syncNativeThemeUI()
    syncH5Chrome()
    // #ifdef WEB
    ensureH5TabBarObserver(scheduleSyncH5Chrome)
    // #endif
  }

  onShow(() => syncChrome())
  watch(() => themeStore.mode, () => syncChrome())
  return useTheme()
}
