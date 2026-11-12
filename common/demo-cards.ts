// demo 自定义消息（对齐 uikit 源码仓库 demo-card 的宿主卡片模式）：
// 名片（contact-card）经 EmKit.sendCustom 发送，双方本地按 event 分发渲染。
import { EmKit } from '@/uni_modules/easemob-uikit-uni/libs'
import type { ConversationTypeValue, EmMessageItem } from '@/uni_modules/easemob-uikit-uni/libs'

export const CUSTOM_EVENT_CONTACT_CARD = 'contact-card'

export interface ContactCardPayload {
	userId: string
	nickname: string
	avatarUrl: string
}

export function sendContactCard(to: string, chatType: ConversationTypeValue, payload: ContactCardPayload): Promise<unknown> {
	return EmKit.sendCustom(to, chatType, CUSTOM_EVENT_CONTACT_CARD, {
		userId: payload.userId,
		nickname: payload.nickname,
		avatarUrl: payload.avatarUrl
	})
}

export function contactCardOf(message: EmMessageItem): ContactCardPayload | null {
	if (message.customEvent !== CUSTOM_EVENT_CONTACT_CARD) return null
	const userId = message.customParams['userId'] ?? ''
	if (userId === '') return null
	return {
		userId,
		nickname: message.customParams['nickname'] ?? userId,
		avatarUrl: message.customParams['avatarUrl'] ?? ''
	}
}
