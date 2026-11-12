import { LOCALE, getLocale, mergeMessages, useLocale } from '@/uni_modules/easemob-uikit-uni/libs'
import { demoZhCN } from './zh-CN'
import { demoEn } from './en'

let demoLocaleReady = false

// 将 demo 外壳文案注入 UIKit 文案容器（幂等）；t() 缺 key 回退 zh-CN
export function initDemoLocale(): void {
	if (demoLocaleReady) {
		return
	}
	demoLocaleReady = true
	mergeMessages(LOCALE.ZH_CN, demoZhCN)
	mergeMessages(LOCALE.EN, demoEn)
}

// 与 pages.json tabBar list 保持一致（App.uvue / 各 tab 页中已有相同硬编码）
const TAB_BAR_PAGES: string[] = [
	'pages/conversation/conversation',
	'pages/contact/contact',
	'pages/settings/settings',
]

// 原生 tabBar 文案随语言切换（pages.json 中为静态中文，仅作占位）
// setTabBarItem 要求当前页是 tab 页（onLaunch 时启动页为登录页，不在名单内直接跳过）
export function syncTabBarLocale(): void {
	try {
		const pages: any[] = getCurrentPages() as any[]
		const current: any = pages.length > 0 ? pages[pages.length - 1] : null
		const route = (current != null ? current.route : '') as string
		if (route === '' || TAB_BAR_PAGES.indexOf(route) < 0) {
			return
		}
		const locale = useLocale()
		uni.setTabBarItem({ index: 0, text: locale.t('demo.tabbar.conversation') })
		uni.setTabBarItem({ index: 1, text: locale.t('demo.tabbar.contact') })
		uni.setTabBarItem({ index: 2, text: locale.t('demo.tabbar.settings') })
	} catch (e) {
	}
}

// 模块加载即注入，保证任意页面 import 链上 t('demo.*') 可用
initDemoLocale()

export { getLocale, useLocale, LOCALE }
