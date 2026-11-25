// 消息附件下载：把「图片/视频保存到相册、文件下载并尝试打开」收口为一个纯编排方法。
// 平台差异（H5 浏览器下载 / App·小程序 downloadFile + 相册·openDocument）全部在 libs/platform.ts，
// 本文件只做消息类型判别、文件名生成与结果归一，组件层不写条件编译。

import { ERROR_CODE, MESSAGE_STATUS, MESSAGE_TYPE } from '../constants'
import { downloadFileToLocal, normalizeAttachmentUrl, openDownloadedFile, saveMediaToAlbum } from '../platform'
import { getMessageSource } from '../store/message'
import { errorWithCode } from './error'
import type {
  EmMessageDownloadKind,
  EmMessageDownloadOptions,
  EmMessageDownloadResult,
  EmMessageItem
} from '../types'

/** 消息类型 → 下载类型；文本/语音/自定义/系统通知不参与下载 */
export function downloadKindOf(message: EmMessageItem): EmMessageDownloadKind | null {
  if (message.type === MESSAGE_TYPE.IMAGE) return 'image'
  if (message.type === MESSAGE_TYPE.VIDEO) return 'video'
  if (message.type === MESSAGE_TYPE.FILE) return 'file'
  return null
}

/** 下载源地址：优先原图/原文件，图片缺原图时回落缩略图；其余类型只认 url */
export function downloadUrlOf(message: EmMessageItem): string {
  if (typeof message.url === 'string' && message.url !== '') return message.url
  if (message.type === MESSAGE_TYPE.IMAGE && typeof message.thumbUrl === 'string' && message.thumbUrl !== '') {
    return message.thumbUrl
  }
  return ''
}

function appendQueryParam(url: string, key: string, value: string): string {
  const [main = '', hashPart] = url.split('#', 2)
  const [basePath, queryString = ''] = main.split('?', 2)
  const entries = queryString.split('&').filter(Boolean)
  entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  return `${basePath}?${entries.join('&')}${hashPart ? `#${hashPart}` : ''}`
}

export function downloadRequestUrlOf(message: EmMessageItem, kind: EmMessageDownloadKind): string {
  let url = kind === 'image' && message.originalUrl !== '' ? message.originalUrl : downloadUrlOf(message)
  let secret = message.attachmentSecret ?? ''
  const source = getMessageSource(message.localId)
  if (source != null && source.body != null && typeof source.body === 'object' && !Array.isArray(source.body)) {
    const body = source.body as Record<string, unknown>
    if (kind === 'image') {
      const original = body['originalImageUrl']
      const big = body['bigImageUrl']
      const thumbnail = body['thumbnailUrl']
      url = typeof original === 'string'
        ? original
        : (typeof big === 'string' ? big : (typeof thumbnail === 'string' ? thumbnail : ''))
    } else {
      const remote = body['url']
      url = typeof remote === 'string' ? remote : ''
    }
    secret = typeof body['secret'] === 'string' ? body['secret'] : ''
  }
  if (url === '') return ''
  url = normalizeAttachmentUrl(url)
  if (!url.includes('em-redirect')) url = appendQueryParam(url, 'em-redirect', 'true')
  if (secret !== '' && !url.includes('share-secret=')) url = appendQueryParam(url, 'share-secret', secret)
  return url
}

/** 文件名去路径分隔符与系统非法字符，限长避免超长文件名写盘失败 */
function sanitizeFileName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return ''
  const cleaned = trimmed.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ')
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned
}

/** 从 URL 取最后一段作为文件名（chatfiles 直链通常是无扩展名 UUID，取不到可读名时由调用方兜底） */
function fileNameFromUrl(url: string): string {
  const noQuery = url.split('?')[0].split('#')[0]
  const slash = noQuery.lastIndexOf('/')
  const base = slash >= 0 ? noQuery.slice(slash + 1) : noQuery
  if (base === '') return ''
  try {
    return decodeURIComponent(base)
  } catch (e) {
    return base
  }
}

const MEDIA_FILE_NAME_RE = /\.(jpe?g|png|gif|webp|bmp|heic|mp4|mov|m4v|webm)$/i

/**
 * 生成下载文件名：
 * - 文件消息优先用原始 fileName，缺失时用 URL 末段（需带扩展名），再兜底 `file-<时间戳>`；
 * - 图片/视频优先用带媒体扩展名的原始名/URL 末段，否则按类型给 `image-<时间戳>.jpg` / `video-<时间戳>.mp4`。
 * H5 的 a[download] 与 App/mp 的 openDocument 都依赖这个文件名（尤其扩展名）。
 */
export function attachmentFileNameOf(message: EmMessageItem, kind: EmMessageDownloadKind): string {
  const raw = sanitizeFileName(message.fileName)
  if (kind === 'file') {
    if (raw !== '') return raw
    const fromUrl = sanitizeFileName(fileNameFromUrl(message.url))
    if (fromUrl !== '' && fromUrl.indexOf('.') > 0) return fromUrl
    return `file-${Date.now()}`
  }
  if (raw !== '' && MEDIA_FILE_NAME_RE.test(raw)) return raw
  const fromUrl = sanitizeFileName(fileNameFromUrl(message.url))
  if (fromUrl !== '' && MEDIA_FILE_NAME_RE.test(fromUrl)) return fromUrl
  const stamp = `${Date.now()}`
  return kind === 'image' ? `image-${stamp}.jpg` : `video-${stamp}.mp4`
}

/** 自己已发送且仍在本地的文件路径；远端、blob/data 与其他消息类型一律回退下载。 */
export function localFilePathOf(message: EmMessageItem): string {
  if (message.type !== MESSAGE_TYPE.FILE || !message.self || message.status !== MESSAGE_STATUS.SENT) return ''
  const path = message.url
  if (path === '' || path.indexOf('//') === 0 || path.indexOf('http://') === 0 || path.indexOf('https://') === 0) return ''
  if (path.indexOf('blob:') === 0 || path.indexOf('data:') === 0) return ''
  return path
}

/** 本地打开成功返回 true；没有可用本地文件或系统打开失败均返回 false，由调用方回退远端下载。 */
export async function openLocalFileAttachment(message: EmMessageItem): Promise<boolean> {
  const filePath = localFilePathOf(message)
  if (filePath === '') return false
  return openDownloadedFile(filePath, attachmentFileNameOf(message, 'file'))
}

/**
 * 下载消息附件（对宿主公开）：
 * - 图片/视频：App/小程序写入相册（savedToAlbum=true），H5 走浏览器下载（savedToAlbum=false）；
 * - 文件：App/小程序下载到本地并尝试系统文档预览（opened 表示是否打开成功），H5 走浏览器下载。
 * 失败时抛出带 code 的 Error：DOWNLOAD_AUTH_DENIED（相册权限）/ DOWNLOAD_UNSUPPORTED（类型或 URL 不支持）。
 * 打开失败不算下载失败，返回 opened=false 由 UI 提示「已下载但无法打开」。
 */
export async function downloadAttachment(
  message: EmMessageItem,
  options: EmMessageDownloadOptions = {}
): Promise<EmMessageDownloadResult> {
  const kind = downloadKindOf(message)
  if (kind == null) {
    throw errorWithCode(ERROR_CODE.DOWNLOAD_UNSUPPORTED, 'message has no downloadable attachment')
  }
  const url = downloadRequestUrlOf(message, kind)
  if (url === '') {
    throw errorWithCode(ERROR_CODE.DOWNLOAD_UNSUPPORTED, 'message has no downloadable attachment')
  }
  const fileName = attachmentFileNameOf(message, kind)
  if (kind === 'file') {
    const file = await downloadFileToLocal(url, fileName, options.onProgress)
    const opened = file.filePath !== '' ? await openDownloadedFile(file.filePath, fileName) : false
    return {
      kind,
      fileName,
      filePath: file.filePath,
      savedToAlbum: false,
      opened
    }
  }
  const saved = await saveMediaToAlbum(url, fileName, kind, options.onProgress)
  return {
    kind,
    fileName,
    filePath: saved.filePath,
    savedToAlbum: saved.savedToAlbum,
    opened: false
  }
}
