// App 端附件能力：使用 uni.chooseFile，保留系统选择器返回的缓存路径。

import type { EmAttachment, EmAttachmentPickOptions, EmAttachmentProvider } from '@/uni_modules/easemob-uikit-uni/libs'

const MIME_OF_TYPE: Record<string, string> = {
	image: 'image/*',
	video: 'video/*',
	audio: 'audio/*'
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
						try {
							const files = (res.tempFiles ?? []) as Array<{ name?: string, path?: string, size?: number, type?: string }>
							const picked: EmAttachment[] = []
							files.forEach((f) => {
								const path = f.path ?? ''
								if (path === '') return
								const mime = f.type == null ? undefined : MIME_OF_TYPE[f.type]
								picked.push({
									path,
									name: f.name ?? path,
									size: f.size ?? 0,
									mimeType: mime
								})
							})
							resolve(picked)
						} catch (e) {
							reject(e as Error)
						}
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
