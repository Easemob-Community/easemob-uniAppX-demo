// 逐条消息转发（对齐 vue3 demo 消息操作菜单的 forward 能力；uikit-uni 未内置，宿主基于公开 API 实现）。
// 文本：直接经 EmKit.sendText 重发原文；
// 图片/视频/文件：本地路径直接重传，远程附件先下载到临时路径，再经 EmKit 对应发送 API 重传
// （走 uikit 公开管线，本地落库/发送状态/失败重发与正常发送一致；不直接调 SDK 绕过 store）。
// 语音在 H5 缺 File 封装（uikit sendAudio 不转 blob），转发类型限定 文本/图片/视频/文件。
import { downloadKindOf, downloadRequestUrlOf, EmKit, MESSAGE_TYPE } from '@/uni_modules/easemob-uikit-uni/libs'
import type { ConversationTypeValue, EmMessageItem } from '@/uni_modules/easemob-uikit-uni/libs'

const FORWARDABLE = [
	MESSAGE_TYPE.TEXT,
	MESSAGE_TYPE.IMAGE,
	MESSAGE_TYPE.VIDEO,
	MESSAGE_TYPE.FILE
] as string[]

export type ForwardErrorStage = 'source' | 'download' | 'send'

export interface ForwardFailure {
	stage: ForwardErrorStage
	detail: string
	code: string | number | null
}

interface StagedForwardError extends Error {
	stage: ForwardErrorStage
	code?: string | number
}

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
			await sendForwarded(() => EmKit.sendText(to, chatType, message.text))
			return
		case MESSAGE_TYPE.IMAGE: {
			const path = await forwardPathOf(message)
			await sendForwarded(() => EmKit.sendImage(to, chatType, {
				path,
				name: fileNameOf(message.url, message.fileName, 'image.jpg'),
				size: message.fileSize,
				webFile: null
			}))
			return
		}
		case MESSAGE_TYPE.VIDEO: {
			const path = await forwardPathOf(message)
			await sendForwarded(() => EmKit.sendVideo(to, chatType, {
				path,
				name: fileNameOf(message.url, message.fileName, 'video.mp4'),
				duration: message.duration,
				width: message.width,
				height: message.height,
				size: message.fileSize
			}))
			return
		}
		case MESSAGE_TYPE.FILE: {
			const path = await forwardPathOf(message)
			await sendForwarded(() => EmKit.sendFile(to, chatType, {
				path,
				name: message.fileName !== '' ? message.fileName : fileNameOf(message.url, '', 'file'),
				size: message.fileSize
			}))
			return
		}
		default:
			throw stagedError('source', new Error('unsupported forward type'))
	}
}

export function forwardFailureOf(error: unknown): ForwardFailure {
	const candidate = error as { stage?: unknown } | null
	const stage = candidate?.stage === 'source' || candidate?.stage === 'download' || candidate?.stage === 'send'
		? candidate.stage
		: 'send'
	return {
		stage,
		detail: errorDetailOf(error),
		code: errorCodeOf(error)
	}
}

async function forwardPathOf(message: EmMessageItem): Promise<string> {
	let url = message.url
	if (url.indexOf('content://') === 0) {
		const kind = downloadKindOf(message)
		const remote = kind == null ? '' : downloadRequestUrlOf(message, kind)
		if (remote.indexOf('http://') === 0 || remote.indexOf('https://') === 0) url = remote
	}
	if (url.trim() === '') {
		throw stagedError('source', new Error('attachment URL is empty'))
	}
	if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) return url
	try {
		return await downloadToTemp(url)
	} catch (error) {
		throw stagedError('download', error)
	}
}

async function sendForwarded(send: () => Promise<unknown>): Promise<void> {
	try {
		await send()
	} catch (error) {
		throw stagedError('send', error)
	}
}

function stagedError(stage: ForwardErrorStage, error: unknown): StagedForwardError {
	const wrapped = new Error(errorDetailOf(error)) as StagedForwardError
	wrapped.stage = stage
	const code = errorCodeOf(error)
	if (code != null) wrapped.code = code
	return wrapped
}

function errorDetailOf(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	if (error != null && typeof error === 'object') {
		const value = error as { errMsg?: unknown, message?: unknown, reason?: unknown }
		if (typeof value.errMsg === 'string' && value.errMsg !== '') return value.errMsg
		if (typeof value.message === 'string' && value.message !== '') return value.message
		if (typeof value.reason === 'string' && value.reason !== '') return value.reason
		try {
			const json = JSON.stringify(error)
			if (json != null && json !== '{}') return json
		} catch (e) {
		}
	}
	return ''
}

function errorCodeOf(error: unknown): string | number | null {
	const code = (error as { code?: unknown } | null)?.code
	if (typeof code === 'number' && Number.isFinite(code)) return code
	if (typeof code === 'string' && code !== '') return code
	return null
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
			fail: (error) => reject(error)
		})
	})
}
