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

  function syncChrome(): void {
    syncNativeThemeUI()
    syncH5Chrome()
  }

  onShow(() => syncChrome())
  watch(() => themeStore.mode, () => syncChrome())
  return useTheme()
}
