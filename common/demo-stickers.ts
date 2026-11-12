import { EmKit } from '@/uni_modules/easemob-uikit-uni/libs'
import type { ConversationTypeValue, EmMessageItem, EmPickedImage } from '@/uni_modules/easemob-uikit-uni/libs'

export interface DemoStickerItem {
	key: string
	url: string
	thumbUrl?: string
}

export interface DemoStickerPack {
	id: string
	stickers: DemoStickerItem[]
}

// #ifdef APP
const STICKER_ROOT = '/static/emojis/huanxin'
// #endif
// #ifndef APP
const STICKER_ROOT = '/sub-im/static/emojis/huanxin'
// #endif

export const DEMO_STICKER_PACK: DemoStickerPack = {
	id: 'huanxin',
	stickers: ['debug', 'biubiu', 'like'].map((key) => ({
		key,
		url: `${STICKER_ROOT}/${key}.gif`,
		thumbUrl: `${STICKER_ROOT}/${key}-封面.jpg`
	}))
}

async function pickedImageOf(sticker: DemoStickerItem): Promise<EmPickedImage> {
	const name = `${sticker.key}.gif`
	let size = 0
	let webFile: unknown | null = null
	// #ifdef WEB
	try {
		const response = await fetch(sticker.url)
		if (response.ok) {
			const blob = await response.blob()
			const file = new File([blob], name, { type: blob.type || 'image/gif' })
			webFile = file
			size = file.size
		}
	} catch {
		webFile = null
	}
	// #endif
	return { path: sticker.url, name, size, webFile }
}

export async function sendDemoSticker(
	to: string,
	chatType: ConversationTypeValue,
	sticker: DemoStickerItem
): Promise<EmMessageItem> {
	const image = await pickedImageOf(sticker)
	return EmKit.sendImage(to, chatType, image, { isSticker: true })
}

export function isDemoSticker(message: EmMessageItem): boolean {
	return message.ext['isSticker'] === true
}

export function demoStickerUrl(message: EmMessageItem): string {
	if (message.originalUrl !== '') return message.originalUrl
	if (message.url !== '') return message.url
	return message.thumbUrl
}
