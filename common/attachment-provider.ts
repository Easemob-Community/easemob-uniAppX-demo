// App 端附件能力：使用 uni.chooseFile；Android content:// 先复制到应用沙箱，保证发送、转发与重发可重复读取。

import type { EmAttachment, EmAttachmentPickOptions, EmAttachmentProvider } from '@/uni_modules/easemob-uikit-uni/libs'

const MIME_OF_TYPE: Record<string, string> = {
	image: 'image/*',
	video: 'video/*',
	audio: 'audio/*'
}

interface UniPickedFile {
	name?: string
	path?: string
	size?: number
	type?: string
}

let attachmentFileSeq = 0

function releaseCopiedFile(path: string): void {
	try {
		uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} })
	} catch (e) {
	}
}

function sandboxFileName(name: string): string {
	const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
	if (cleaned === '') return 'attachment'
	return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned
}

function copyContentFile(path: string, name: string, size: number, mimeType?: string): Promise<EmAttachment> {
	return new Promise((resolve, reject) => {
		const base = (uni.env.USER_DATA_PATH ?? '').replace(/\/+$/, '')
		if (base === '') {
			reject(new Error('应用沙箱路径不可用'))
			return
		}
		attachmentFileSeq += 1
		const target = `${base}/em-picked-${Date.now()}-${attachmentFileSeq}-${sandboxFileName(name)}`
		try {
			uni.getFileSystemManager().copyFile({
				srcPath: path,
				destPath: target,
				success: () => {
					resolve({
						path: target,
						name,
						size,
						mimeType,
						temporary: true,
						release: releaseCopiedFile
					})
				},
				fail: (error) => {
					releaseCopiedFile(target)
					reject(new Error(`附件复制到应用沙箱失败：${error.errMsg}`))
				}
			})
		} catch (e) {
			releaseCopiedFile(target)
			reject(e as Error)
		}
	})
}

async function toAttachment(file: UniPickedFile): Promise<EmAttachment | null> {
	const path = file.path ?? ''
	if (path === '') return null
	const name = file.name ?? path
	const size = file.size ?? 0
	const mimeType = file.type == null ? undefined : MIME_OF_TYPE[file.type]
	if (path.indexOf('content://') === 0) {
		return copyContentFile(path, name, size, mimeType)
	}
	return { path, name, size, mimeType }
}

function createUniAttachmentProvider(): EmAttachmentProvider {
	return {
		isAvailable: () => true,
		pick: (options: EmAttachmentPickOptions) => {
			return new Promise<EmAttachment[]>((resolve, reject) => {
				uni.chooseFile({
					count: options.multiple === false ? 1 : 9,
					type: 'all',
					success: (res) => {
						void (async () => {
							const picked: EmAttachment[] = []
							try {
								const files = (res.tempFiles ?? []) as UniPickedFile[]
								for (const file of files) {
									const item = await toAttachment(file)
									if (item != null) picked.push(item)
								}
								resolve(picked)
							} catch (e) {
								picked.forEach((item) => item.release?.(item.path))
								reject(e as Error)
							}
						})()
					},
					fail: (e) => {
						if ((e as { errCode?: number }).errCode === 1101001) {
							resolve([])
							return
						}
						reject(new Error('文件选择失败'))
					}
				})
			})
		}
	}
}

export function createAttachmentProvider(): EmAttachmentProvider {
	return createUniAttachmentProvider()
}
