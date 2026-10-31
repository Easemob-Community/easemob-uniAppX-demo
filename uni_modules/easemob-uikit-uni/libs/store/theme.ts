import { reactive } from 'vue'
import { LOCALE, THEME_MODE } from '../constants'
import type { EmLocaleName, EmThemeMode, EmThemePreference } from '../types'

// 主题与语言全局唯一 store（裸 reactive，零依赖）
// preference = 用户偏好（auto/light/dark，持久化）；mode = 解析后的实际主题（themeClass 消费）；
// systemMode = 最近一次读到的系统主题（auto 时 mode 跟随它，系统变化由 useTheme 的监听回写）。
export const themeStore = reactive({
  preference: THEME_MODE.AUTO as EmThemePreference,
  mode: THEME_MODE.LIGHT as EmThemeMode,
  systemMode: THEME_MODE.LIGHT as EmThemeMode,
  locale: LOCALE.ZH_CN as EmLocaleName
})
