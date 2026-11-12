// 逐条消息转发（对齐 vue3 demo 消息操作菜单的 forward 能力；uikit-uni 未内置，宿主基于公开 API 实现）。
// 文本：直接经 EmKit.sendText 重发原文；
// 图片/视频/文件：先把原附件下载到本地临时路径，再经 EmKit 对应发送 API 重传
// （走 uikit 公开管线，本地落库/发送状态/失败重发与正常发送一致；不直接调 SDK 绕过 store）。
// 语音在 H5 缺 File 封装（uikit sendAudio 不转 blob），转发类型限定 文本/图片/视频/文件。
import { EmKit, MESSAGE_TYPE } from '@/uni_modules/easemob-uikit-uni/libs'
import type { ConversationTypeValue, EmMessageItem } from '@/uni_modules/easemob-uikit-uni/libs'

const FORWARDABLE = [
	MESSAGE_TYPE.TEXT,
	MESSAGE_TYPE.IMAGE,
	MESSAGE_TYPE.VIDEO,
	MESSAGE_TYPE.FILE
] as string[]

export function canForwardMessage(message: EmMessageItem): boolean {
	return FORWARDABLE.indexOf(message.type as string) >= 0
}

export async function forwardMessage(
	message: EmMessageItem,
	to: string,
	chatType: ConversationTypeValue
): Promise<void> {
	switch (message.type as string) {
		case MESSAGE_TYPE.TEXT:
			await EmKit.sendText(to, chatType, message.text)
			return
		case MESSAGE_TYPE.IMAGE: {
			const path = await downloadToTemp(message.url)
			await EmKit.sendImage(to, chatType, {
				path,
				name: fileNameOf(message.url, message.fileName, 'image.jpg'),
				size: message.fileSize,
				webFile: null
			})
			return
		}
		case MESSAGE_TYPE.VIDEO: {
			const path = await downloadToTemp(message.url)
			await EmKit.sendVideo(to, chatType, {
				path,
				name: fileNameOf(message.url, message.fileName, 'video.mp4'),
				duration: message.duration,
				width: message.width,
				height: message.height,
				size: message.fileSize
			})
			return
		}
		case MESSAGE_TYPE.FILE: {
			const path = await downloadToTemp(message.url)
			await EmKit.sendFile(to, chatType, {
				path,
				name: message.fileName !== '' ? message.fileName : fileNameOf(message.url, '', 'file'),
				size: message.fileSize
			})
			return
		}
		default:
			throw new Error('unsupported forward type')
	}
}

function fileNameOf(url: string, fallback: string, def: string): string {
	if (fallback !== '') return fallback
	if (url !== '') {
		const name = url.slice(url.lastIndexOf('/') + 1).split('?')[0]
		if (name !== '') return name
	}
	return def
}

function downloadToTemp(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		uni.downloadFile({
			url,
			success: (res) => {
				if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath !== '') {
					resolve(res.tempFilePath)
				} else {
					reject(new Error(`download failed (${res.statusCode})`))
				}
			},
			fail: (error) => reject(new Error(error.errMsg))
		})
	})
}
