// 设置页菜单选中态 + demo 业务特性开关（模块级共享，持久化到 uni storage）
import { ref } from 'vue'

export const settingsActiveKey = ref<string>('account')

// ===== demo 业务特性开关（features 页直连，聊天页/会话页消费） =====
// 与 uiConfig 解耦：这些是 demo 宿主侧能力，不进 uikit 配置容器

export interface DemoFeatureKeyValue {
	watermark: boolean
	contactCard: boolean
	messageForward: boolean
}

const STORAGE_KEY = 'demo_feature_toggles'

const DEFAULTS: DemoFeatureKeyValue = {
	watermark: true,
	contactCard: true,
	messageForward: true
}

function loadToggles(): DemoFeatureKeyValue {
	const merged: DemoFeatureKeyValue = { ...DEFAULTS }
	try {
		const raw = uni.getStorageSync(STORAGE_KEY) as string
		if (raw !== '') {
			const parsed = JSON.parse(raw) as Record<string, unknown>
			;(Object.keys(DEFAULTS) as (keyof DemoFeatureKeyValue)[]).forEach((key) => {
				if (typeof parsed[key] === 'boolean') {
					merged[key] = parsed[key] as boolean
				}
			})
		}
	} catch (e) {}
	return merged
}

export const demoFeatures = ref<DemoFeatureKeyValue>(loadToggles())

export function setDemoFeature(key: keyof DemoFeatureKeyValue, value: boolean): void {
	demoFeatures.value[key] = value
	try {
		uni.setStorageSync(STORAGE_KEY, JSON.stringify(demoFeatures.value))
	} catch (e) {}
}
