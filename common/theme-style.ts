import { ref } from 'vue'
import { setConfig } from '@/uni_modules/easemob-uikit-uni/libs'

export type DemoThemeColorKey = 'primaryColor' | 'otherBubbleColor' | 'selfBubbleColor'

export interface DemoThemeColors {
	primaryColor: string
	otherBubbleColor: string
	selfBubbleColor: string
}

export const THEME_COLOR_PRESETS: Record<DemoThemeColorKey, string[]> = {
	primaryColor: ['#33B1FF', '#009EFF', '#07C160', '#7B61FF', '#FF8A34', '#EC4899'],
	otherBubbleColor: ['#E4E6E7', '#F3F4F6', '#DCEAF3', '#DDF3E4', '#F7E8D0', '#EEE7F7'],
	selfBubbleColor: ['#009EFF', '#33B1FF', '#07C160', '#7B61FF', '#FF8A34', '#EC4899']
}

const STORAGE_KEY = 'demo_theme_colors'
const DEFAULT_COLORS: DemoThemeColors = {
	primaryColor: '',
	otherBubbleColor: '',
	selfBubbleColor: ''
}

function isPresetColor(key: DemoThemeColorKey, value: unknown): value is string {
	return typeof value === 'string' && (value === '' || THEME_COLOR_PRESETS[key].includes(value))
}

function loadThemeColors(): DemoThemeColors {
	const colors: DemoThemeColors = { ...DEFAULT_COLORS }
	try {
		const raw = uni.getStorageSync(STORAGE_KEY) as string
		if (raw === '') return colors
		const parsed = JSON.parse(raw) as Record<string, unknown>
		;(Object.keys(DEFAULT_COLORS) as DemoThemeColorKey[]).forEach((key) => {
			if (isPresetColor(key, parsed[key])) colors[key] = parsed[key]
		})
	} catch (e) {}
	return colors
}

export const demoThemeColors = ref<DemoThemeColors>(loadThemeColors())

function persistThemeColors(): void {
	try {
		uni.setStorageSync(STORAGE_KEY, JSON.stringify(demoThemeColors.value))
	} catch (e) {}
}

export function applyDemoThemeColors(): void {
	setConfig({ primaryColor: demoThemeColors.value.primaryColor })
}

export function setDemoThemeColor(key: DemoThemeColorKey, value: string): void {
	if (!isPresetColor(key, value)) return
	demoThemeColors.value[key] = value
	if (key === 'primaryColor') applyDemoThemeColors()
	persistThemeColors()
}

export function demoPrimaryColorStyle(): string {
	const color = demoThemeColors.value.primaryColor
	return color !== '' ? `--em-primary-color: ${color};` : ''
}

export function demoBubbleColorStyle(): string {
	const other = demoThemeColors.value.otherBubbleColor
	const self = demoThemeColors.value.selfBubbleColor
	let style = ''
	if (other !== '') style += `--em-bubble-bg-other: ${other};`
	if (self !== '') style += `--em-bubble-bg-self: ${self};`
	return style
}
