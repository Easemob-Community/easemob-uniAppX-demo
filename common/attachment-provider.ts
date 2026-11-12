// App 端附件能力：默认使用 uni.chooseFile，也可切换为 easemob-file-picker 插件。
// uni 模式保留系统选择器返回的缓存路径；插件模式复制为独立缓存副本，由 UIKit 管理释放。

import { chooseFile, prepareFile, removeTempFile } from '@/uni_modules/easemob-file-picker'
import type { EmAttachment, EmAttachmentPickOptions, EmAttachmentProvider } from '@/uni_modules/easemob-uikit-uni/libs'

export type AttachmentProviderMode = 'uni' | 'plugin'

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

const leasedPaths = new Set<string>()

function releaseAttachment(path: string): void {
	leasedPaths.delete(path)
	try {
		removeTempFile({
			path,
			success: (result) => {
				if (!result.removed) console.warn('attachment temp file was not removed:', path)
			},
			fail: (e) => {
				console.warn('remove attachment temp file failed:', e.errCode, e.errMsg)
			}
		})
	} catch (e) {
		console.warn('remove attachment temp file unavailable:', e)
	}
}

function prepareFileAttachment(uri: string): Promise<EmAttachment> {
	return new Promise<EmAttachment>((resolve, reject) => {
		prepareFile({
			uri,
			success: (file) => {
				const path = file.path ?? ''
				if (path === '') {
					reject(new Error('文件本地路径不可用'))
					return
				}
				resolve({
					path,
					name: file.name,
					size: file.size,
					mimeType: file.mimeType !== '' ? file.mimeType : undefined,
					temporary: true,
					release: releaseAttachment
				})
			},
			fail: (e) => reject(e)
		})
	})
}

async function prepareUniqueAttachment(uri: string): Promise<EmAttachment> {
	let attachment = await prepareFileAttachment(uri)
	const attempted = new Set<string>()
	while (leasedPaths.has(attachment.path)) {
		const sourcePath = attachment.path
		if (attempted.has(sourcePath)) throw new Error('无法创建独立的附件临时副本')
		attempted.add(sourcePath)
		attachment = await prepareFileAttachment(sourcePath)
	}
	leasedPaths.add(attachment.path)
	return attachment
}

function chooseAttachmentUris(options: EmAttachmentPickOptions): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		chooseFile({
			mimeTypes: options.mimeTypes,
			multiple: options.multiple == true,
			success: (result) => {
				if (result.cancelled || result.files.length === 0) {
					resolve([])
					return
				}
				const uris: string[] = []
				result.files.forEach((file) => uris.push(file.uri))
				resolve(uris)
			},
			fail: (e) => reject(e)
		})
	})
}

async function prepareAttachments(uris: string[]): Promise<EmAttachment[]> {
	const files: EmAttachment[] = []
	let index = 0
	try {
		for (; index < uris.length; index++) {
			files.push(await prepareUniqueAttachment(uris[index]))
		}
		return files
	} catch (e) {
		// iOS 在选择回调中已预复制全部文件，失败时逐个取回并清理尚未返回的副本。
		// #ifdef APP-IOS
		for (let i = index; i < uris.length; i++) {
			try {
				files.push(await prepareUniqueAttachment(uris[i]))
			} catch (cleanupError) {
				console.warn('prepare attachment for cleanup failed:', cleanupError)
			}
		}
		// #endif
		files.forEach((file) => releaseAttachment(file.path))
		throw e
	}
}

function createPluginAttachmentProvider(): EmAttachmentProvider {
	return {
		isAvailable: () => true,
		pick: async (options: EmAttachmentPickOptions) => {
			const uris = await chooseAttachmentUris(options)
			return prepareAttachments(uris)
		},
		resolve: (uri: string) => prepareUniqueAttachment(uri)
	}
}

export function createAttachmentProvider(mode: AttachmentProviderMode = 'uni'): EmAttachmentProvider {
	return mode === 'plugin' ? createPluginAttachmentProvider() : createUniAttachmentProvider()
}
