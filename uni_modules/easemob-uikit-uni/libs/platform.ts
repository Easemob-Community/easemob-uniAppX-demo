// 平台适配层：存储 / 网络 / 媒体差异统一收口，组件不直接碰平台 API。
// localStorage 在 App 端 js 引擎不可用，一律走 uni.setStorage。

import { createLogger } from './utils/logger'
import { errorWithCode } from './utils/error'
import { ERROR_CODE, OPEN_DOCUMENT_FILE_TYPES } from './constants'
import type { EmAttachment } from './types'

const logger = createLogger('platform')

/**
 * 平台能力开关（1.0 功能显隐）：
 * 不支持的端在 UI 侧直接隐藏入口，避免「点一下只弹暂不支持」的坏体验。
 * 平台差异只允许出现在本文件（#ifdef），组件消费布尔值，不再散落条件编译。
 */
export interface EmPlatformCapabilities {
  /** 视频播放/预览：全端支持（内置全屏 em-video-preview + 原生 video 组件） */
  videoPreview: boolean
  /** 内置文件选择：小程序 + H5；App 无内置选择器（宿主注入附件能力后由 libs/attachment.ts 调起） */
  filePick: boolean
  /** 文件打开/下载：全端支持；App/小程序本地优先，H5 走浏览器下载 */
  fileOpen: boolean
}

function detectPlatformCapabilities(): EmPlatformCapabilities {
  const caps: EmPlatformCapabilities = {
    videoPreview: true,
    filePick: true,
    fileOpen: true
  }
  // #ifdef APP
  // 内置选择器在 App 端不可用；宿主可经 EmKit.setAttachmentProvider 注入平台文件选择能力，
  // UI 显隐统一读 libs/attachment.ts 的 canPickAttachment()（本开关只表示“内置能力”）
  caps.filePick = false
  // #endif
  return caps
}

/** 当前端能力快照（组件只读；平台分支集中在 detectPlatformCapabilities） */
export const PLATFORM_CAPABILITIES: EmPlatformCapabilities = detectPlatformCapabilities()

/**
 * 页面是否可见：H5 标签页隐藏时，当前会话收到消息不应清未读/发已读回执。
 * App/小程序没有跨端统一的页面可见 API，默认 true（退化为原行为）。
 */
export function isPageVisible(): boolean {
  // #ifdef WEB
  return typeof document === 'undefined' || document.visibilityState === 'visible'
  // #endif
  // #ifndef WEB
  return true
  // #endif
}

// ========== 网络状态收口 ==========

/**
 * 监听网络连通性变化，返回取消函数（`uni.onXxx` 在 x 端返回监听 id，`offXxx` 按 id 反注册）。
 *
 * 只用 `uni.onNetworkStatusChange`，**不探测 `uni.getNetworkType`**：两者同属 iOS/Android 的
 * `uni-getNetworkType` UTS 模块，旧自定义基座若没把该模块编进去，调用会抛
 * `undefined class: UTSSDKModulesDCloudUniGetNetworkTypeIndexSwift`。websdk 5.1.3 默认 runtime
 * 适配器在 `onNetworkChange` 里既调 `onNetworkStatusChange` 又同步调 `getNetworkType`，
 * 而 SDK 在建连（login）阶段就注册网络监听 → 该异常会直接表现为「登录失败」。
 * 这里再兜一层 try/catch：基座缺模块时降级为不监听（SDK 仍有心跳/重连循环），不让登录被拖死。
 */
/**
 * 一次性探测系统网络是否可用，resolve true=在线 / false=离线 / null=未知。
 *
 * 与 subscribeNetworkStatus 同踩一个坑：基座缺 `uni-getNetworkType` 模块时调用会**同步抛**
 * （见上方注释），因此只用于用户触发入口（点发送/点登录）的预检测，绝不进 SDK init 路径；
 * 任何异常一律降级为 null（不预判、不阻断），调用方对 null 一律放行原路径。
 */
export function checkNetworkOnce(): Promise<boolean | null> {
  return new Promise<boolean | null>((resolve) => {
    try {
      uni.getNetworkType({
        success: (res) => {
          resolve(res.networkType !== 'none')
        },
        fail: () => {
          resolve(null)
        }
      })
    } catch (e) {
      logger.warn('checkNetworkOnce: 网络探测不可用（基座可能缺 uni-getNetworkType 模块）', e)
      resolve(null)
    }
  })
}

export function subscribeNetworkStatus(listener: (online: boolean) => void): () => void {
  try {
    if (typeof uni.onNetworkStatusChange !== 'function') {
      return () => {}
    }
    const id = uni.onNetworkStatusChange((res) => {
      listener(res.isConnected)
    })
    return () => {
      try {
        uni.offNetworkStatusChange(id)
      } catch (e) {}
    }
  } catch (e) {
    logger.warn('subscribeNetworkStatus: 网络状态监听不可用（基座可能缺 uni-getNetworkType 模块）', e)
    return () => {}
  }
}

export function setStorage(key: string, value: string): void {
  try {
    uni.setStorageSync(key, value)
  } catch (e) {
    logger.error('setStorage fail:', key, e)
  }
}

export function getStorage(key: string): string {
  try {
    const value = uni.getStorageSync(key) as string | null
    return value ?? ''
  } catch (e) {
    return ''
  }
}

export interface EmPickedImage {
  path: string              // 本地临时路径（H5 为 blob URL，仅用于本地预览）
  name: string
  size: number              // 字节（部分端可能为 0）
  webFile: unknown | null   // H5 的 File 对象（SDK 上传需要 File），其它端恒 null
}

function fileNameOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}

// 媒体选择收口：SDK 5.x createXxxMessage 的 data 不收字符串路径，
// 必须 File（H5）或 MiniAppFile { path, name, size }（小程序/App），这里把两端的素材都带齐
// sourceType 'camera' 即拍摄（小程序/App 调起相机；H5 浏览器无相机概念，一律退化为文件选择器）
function isUserCancellation(error: unknown): boolean {
  const detail = error as { errMsg?: string, message?: string } | null
  const text = typeof error === 'string' ? error : `${detail?.errMsg ?? ''} ${detail?.message ?? ''}`
  return /\bcancel(?:ed|led)?\b/i.test(text)
}

export type EmCameraAuthorizeState = 'authorized' | 'denied' | 'not determined' | 'config error' | 'unknown'

/**
 * 相机系统授权状态（仅 iOS 预检；其它端/基座缺模块回 unknown，调用方不做预检）。
 * iOS 上用户拒绝相机权限后，uni.chooseImage 仍会拉起拍摄页并停在纯黑画面（系统不再弹窗），
 * 所以调起前先查一次：denied / config error 交给宿主引导去设置，别把用户丢在黑屏里。
 * Android 不做预检：未授权时也可能返回 denied，提前拦截会挡掉首次系统弹窗。
 */
export function getCameraAuthorizeState(): EmCameraAuthorizeState {
  // #ifdef APP-IOS
  try {
    return uni.getAppAuthorizeSetting().cameraAuthorized as EmCameraAuthorizeState
  } catch (e) {
    // 自定义基座没编入 uni-getAppAuthorizeSetting 时降级为 unknown（不阻断拍摄）
    logger.warn('getAppAuthorizeSetting unavailable:', e)
    return 'unknown'
  }
  // #endif
  // #ifndef APP-IOS
  return 'unknown'
  // #endif
}

export function canOpenAuthorizeSetting(): boolean {
  // #ifdef APP
  return true
  // #endif
  // #ifdef MP-WEIXIN
  return true
  // #endif
  return false
}

/** 打开系统授权设置页（App/微信小程序；基座缺模块或调用失败时静默，由调用方文案兜底） */
export function openAppAuthorizeSetting(): void {
  // #ifdef APP
  try {
    uni.openAppAuthorizeSetting({})
  } catch (e) {
    logger.warn('openAppAuthorizeSetting unavailable:', e)
  }
  // #endif
  // #ifdef MP-WEIXIN
  try {
    uni.openSetting({})
  } catch (e) {
    logger.warn('openSetting unavailable:', e)
  }
  // #endif
}

export function chooseImage(count = 1, sourceType: 'album' | 'camera' = 'album'): Promise<EmPickedImage[]> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sourceType: [sourceType],
      // #ifdef APP-ANDROID
      albumMode: sourceType === 'album' ? 'system' : 'custom',
      // #endif
      success: (res) => {
        try {
          const paths = res.tempFilePaths as string[]
          const files = (res.tempFiles ?? []) as Array<{ path?: string, size?: number, name?: string }>
          resolve(paths.map((p, i) => {
            const f = files[i]
            // #ifdef WEB
            // H5 的 tempFiles 是 File 对象，SDK 上传直接用它
            return { path: p, name: f?.name ?? fileNameOf(p), size: f?.size ?? 0, webFile: f ?? null }
            // #endif
            // #ifndef WEB
            return { path: p, name: fileNameOf(f?.path ?? p), size: f?.size ?? 0, webFile: null }
            // #endif
          }))
        } catch (e) {
          reject(e)
        }
      },
      fail: (e) => {
        if (isUserCancellation(e)) {
          resolve([])
          return
        }
        reject(e)
      }
    })
  })
}

export function previewImage(urls: string[], current: string): void {
  uni.previewImage({ urls, current })
}

/**
 * 视频 URL 归一：iOS App 的 ATS 默认拒绝 http，历史消息/旧服务端可能回 http 文件地址，
 * 这里统一升到 https（EaseMob 文件服务同时支持 https）。其它端原样返回，避免破坏 http-only 环境。
 * 协议相对地址（//host/...）原生播放器不认，统一补 https。
 */
export function normalizeVideoUrl(url: string): string {
  if (url.indexOf('//') === 0) return `https:${url}`
  // #ifdef APP-IOS
  if (url.indexOf('http://') === 0) return `https://${url.slice(7)}`
  // #endif
  return url
}

/** App 下载环信附件时统一使用 HTTPS，避免 Android cleartext 策略拦截；查询参数由调用方保留。 */
export function normalizeAttachmentUrl(url: string): string {
  if (url.indexOf('//') === 0) return `https:${url}`
  // #ifdef APP
  if (url.indexOf('http://') === 0) return `https://${url.slice(7)}`
  // #endif
  return url
}

export interface EmVideoSourceTask {
  promise: Promise<string>
  abort: () => void
}

// App 端已下载的视频本地路径缓存（同一消息重复打开不再重复下载；文件在 USER_DATA_PATH，随应用数据清理）
const videoSourceCache = new Map<string, string>()
let videoFileSeq = 0

// EaseMob chatfiles 直链没有扩展名；AVPlayer 对无后缀本地文件也可能拒绝，
// 复制到 USER_DATA_PATH 并补 .mp4 后缀后再交给 video（复制失败则退回原临时路径）
function toMp4FilePath(tempPath: string): Promise<string> {
  // #ifdef APP
  return new Promise<string>((resolve) => {
    const base = (uni.env.USER_DATA_PATH ?? '').replace(/\/+$/, '')
    if (base === '') {
      resolve(tempPath)
      return
    }
    videoFileSeq += 1
    const target = `${base}/em-video-${Date.now()}-${videoFileSeq}.mp4`
    try {
      uni.getFileSystemManager().copyFile({
        srcPath: tempPath,
        destPath: target,
        success: () => resolve(target),
        fail: (e) => {
          logger.warn('copy video to mp4 fail:', e)
          resolve(tempPath)
        }
      })
    } catch (e) {
      logger.warn('copy video to mp4 fail:', e)
      resolve(tempPath)
    }
  })
  // #endif
  // #ifndef APP
  return Promise.resolve(tempPath)
  // #endif
}

/**
 * 视频源准备：App 端先下载到本地再交给 `video` 播放。
 *
 * EaseMob 的 chatfiles 直链（`.../chatfiles/<uuid>`，无扩展名）实测 **不支持 Range**
 * （带 `Range: bytes=0-1023` 仍返回 200 全量、无 Accept-Ranges/Content-Range）。
 * iOS AVPlayer 对远程渐进播放要求 Range，服务端不支持就会一直转圈（浏览器能边下边播，所以
 * Safari 正常）。下载到本地后播放可绕开该限制；H5/小程序仍直接给远程 URL。
 */
export function prepareVideoSource(url: string, onProgress?: (percent: number) => void): EmVideoSourceTask {
  // #ifdef APP
  // 本地路径直接交给 video；HLS 也不能整包下载（m3u8 是分片索引），保持远程播放
  if ((url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) || url.indexOf('.m3u8') >= 0) {
    if (onProgress != null) onProgress(100)
    return { promise: Promise.resolve(url), abort: () => {} }
  }
  const cached = videoSourceCache.get(url)
  if (cached != null && cached !== '') {
    if (onProgress != null) onProgress(100)
    return { promise: Promise.resolve(cached), abort: () => {} }
  }
  let task: ReturnType<typeof uni.downloadFile> | null = null
  const promise = new Promise<string>((resolve, reject) => {
    task = uni.downloadFile({
      url,
      success: (res) => {
        const path = res.tempFilePath ?? ''
        if (res.statusCode === 200 && path !== '') {
          toMp4FilePath(path).then((finalPath) => {
            videoSourceCache.set(url, finalPath)
            resolve(finalPath)
          })
          return
        }
        reject(new Error(`download video fail: status ${res.statusCode}`))
      },
      fail: (e) => {
        reject(new Error(e?.errMsg ?? 'download video fail'))
      }
    })
    if (task != null && onProgress != null) {
      task.onProgressUpdate((res) => {
        onProgress(res.progress)
      })
    }
  })
  return {
    promise,
    abort: () => {
      if (task == null) return
      try {
        task.abort()
      } catch (e) {}
    }
  }
  // #endif
  // #ifndef APP
  if (onProgress != null) onProgress(100)
  return { promise: Promise.resolve(url), abort: () => {} }
  // #endif
}

// ========== 媒体选择 / 录音 / 播放收口 ==========

export interface EmPickedVideo {
  path: string
  name: string
  duration: number  // 秒
  width: number
  height: number
  size: number      // 字节
}

// 用户取消 resolve(null)，真实选择/读取失败 reject，由组件层反馈
export function chooseVideo(): Promise<EmPickedVideo | null> {
  return new Promise((resolve, reject) => {
    // H5 的 uni.chooseVideo 支持度有限（依赖浏览器文件选择与视频元数据解析）
    uni.chooseVideo({
      sourceType: ['album'],
      // #ifdef APP-ANDROID
      albumMode: 'system',
      // #endif
      success: (res) => {
        try {
          resolve({
            path: res.tempFilePath,
            name: fileNameOf(res.tempFilePath),
            duration: Math.round(res.duration ?? 0),
            width: res.width ?? 0,
            height: res.height ?? 0,
            size: res.size ?? 0
          })
        } catch (e) {
          reject(e)
        }
      },
      fail: (e) => {
        if (isUserCancellation(e)) {
          resolve(null)
          return
        }
        reject(e)
      }
    })
  })
}

/** 内置选择器产物 / 宿主附件能力的可发送形态；H5 的 File 走 webFile，其它端走本地路径 */
export interface EmPickedFile extends EmAttachment {
  webFile?: unknown | null   // H5 的 File 对象（SDK 上传需要 File），其它端为 null
}

export function chooseFile(): Promise<EmPickedFile | null> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        try {
          const f = res.tempFiles[0]
          resolve({ path: f.path, name: f.name, size: f.size, webFile: null })
        } catch (e) {
          reject(e)
        }
      },
      fail: (e) => {
        if (isUserCancellation(e)) {
          resolve(null)
          return
        }
        reject(e)
      }
    })
    // #endif
    // #ifdef WEB
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = () => {
      try {
        const files = input.files
        if (files == null || files.length === 0) {
          resolve(null)
          return
        }
        const f = files[0]
        resolve({ path: '', name: f.name, size: f.size, webFile: f })
      } catch (e) {
        reject(e)
      }
    }
    input.oncancel = () => {
      resolve(null)
    }
    input.click()
    // #endif
    // #ifdef APP
    // App 端没有内置通用文件选择器：宿主注入附件能力后，UI 走 libs/attachment.ts 的 provider；
    // 直接调用本函数仍返回 null（保留旧行为，避免宿主误以为内置可用）。
    logger.warn('chooseFile: App 端无内置文件选择器，请使用 EmKit.setAttachmentProvider')
    resolve(null)
    // #endif
  })
}

export interface EmRecordResult {
  path: string
  duration: number  // 秒
}

/** 录音回调：权限/设备错误与 60s 自动停止（否则自动停止的音频会被静默丢弃） */
export interface EmRecordOptions {
  onError?: (err: unknown) => void
  onAutoStop?: (res: EmRecordResult) => void
}

// 覆盖 start 请求到原生终止的整个轮次；授权等待与开始后错误排水期间都禁止跨轮 start。
let recording = false
let nativeStarted = false
let recordStartAt = 0
let recordStopPromise: Promise<EmRecordResult> | null = null
let recordStopResolve: ((res: EmRecordResult) => void) | null = null
let recordStopReject: ((err: unknown) => void) | null = null
let recordDiscarding = false
let recordStopRequested = false
let recordOptions: EmRecordOptions = {}

function resetRecordStopSettlement(): void {
  recordStopPromise = null
  recordStopResolve = null
  recordStopReject = null
}

function resolveRecordStop(res: EmRecordResult): void {
  const resolve = recordStopResolve
  resetRecordStopSettlement()
  if (resolve != null) resolve(res)
}

function rejectRecordStop(err: unknown): void {
  const reject = recordStopReject
  resetRecordStopSettlement()
  if (reject != null) reject(err)
}

function clearRecordSession(): void {
  recording = false
  nativeStarted = false
  recordDiscarding = false
  recordStopRequested = false
  recordOptions = {}
  resetRecordStopSettlement()
}

// #ifndef WEB
let recorder: ReturnType<typeof uni.getRecorderManager> | null = null

// 单例注册 onStart/onStop/onError：每次 start 都 addEventHandler 会累积监听（真机反复录音后回调翻倍）
function ensureRecorder(): ReturnType<typeof uni.getRecorderManager> {
  if (recorder == null) {
    const manager = uni.getRecorderManager()
    recorder = manager
    manager.onStart(() => {
      nativeStarted = true
      recordStartAt = Date.now()
      // iOS 授权等待期间 audioRecorder 尚未创建，此前的 stop 是空操作；迟到开始后必须补停。
      if (recordStopRequested) manager.stop()
    })
    manager.onStop((res) => {
      const ms = res.duration > 0 ? res.duration : Date.now() - recordStartAt
      const result: EmRecordResult = { path: res.tempFilePath, duration: Math.round(ms / 1000) }
      if (recordDiscarding) {
        clearRecordSession()
        return
      }
      if (recordStopPromise != null) {
        resolveRecordStop(result)
        clearRecordSession()
        return
      }
      const onAutoStop = recordOptions.onAutoStop
      clearRecordSession()
      if (onAutoStop != null) onAutoStop(result)
    })
    manager.onError((err) => {
      const onError = recordOptions.onError
      rejectRecordStop(err)
      if (nativeStarted) {
        // iOS 编码错误不会清空原生 recorder；丢弃并等旧 onStop，不能让它落进下一轮。
        recordDiscarding = true
        recordStopRequested = true
        recordOptions = {}
        manager.stop()
      } else {
        clearRecordSession()
      }
      if (onError != null) {
        onError(err)
      } else {
        logger.warn('recorder error:', err)
      }
    })
  }
  return recorder
}
// #endif

// 录音：微信/App 走 uni.getRecorderManager；H5 不支持，调用即抛错（组件层 catch 降级）
export function startRecord(options: EmRecordOptions = {}): void {
  // #ifdef WEB
  logger.warn('startRecord: H5 不支持录音')
  throw new Error('record not supported on web')
  // #endif
  // #ifndef WEB
  if (recording) return
  recordOptions = options
  nativeStarted = false
  recordStartAt = Date.now()
  recordDiscarding = false
  recordStopRequested = false
  resetRecordStopSettlement()
  recording = true
  try {
    ensureRecorder().start({ duration: 60000, format: 'aac' })
  } catch (e) {
    clearRecordSession()
    throw e
  }
  // #endif
}

// 取消录音：停止并丢弃（上滑取消手势用）
export function cancelRecord(): void {
  if (!recording) return
  recordDiscarding = true
  recordStopRequested = true
  recordOptions = {}
  rejectRecordStop(errorWithCode(ERROR_CODE.RECORD_CANCELLED, 'record cancelled'))
  // #ifndef WEB
  ensureRecorder().stop()
  // #endif
}

export function stopRecord(): Promise<EmRecordResult> {
  // #ifdef WEB
  return Promise.reject(new Error('record not supported on web'))
  // #endif
  // #ifndef WEB
  if (!recording) return Promise.reject(new Error('not recording'))
  if (recordStopPromise != null) return recordStopPromise
  const promise = new Promise<EmRecordResult>((resolve, reject) => {
    recordStopResolve = resolve
    recordStopReject = reject
  })
  recordStopPromise = promise
  recordStopRequested = true
  try {
    ensureRecorder().stop()
  } catch (e) {
    recordDiscarding = true
    rejectRecordStop(e)
    if (!nativeStarted) clearRecordSession()
  }
  return promise
  // #endif
}

export function isRecording(): boolean {
  return recording
}

// 语音播放：全局互斥（播新停旧）；onEnd 在自然结束/出错/被顶替时回调
type EmAudioContext = ReturnType<typeof uni.createInnerAudioContext>
let audioCtx: EmAudioContext | null = null
let audioOnEnd: (() => void) | null = null

export function playAudio(url: string, onEnd: () => void): void {
  stopAudio()
  const ctx = uni.createInnerAudioContext()
  audioCtx = ctx
  audioOnEnd = onEnd
  ctx.src = url
  ctx.onEnded(() => {
    if (audioCtx === ctx) {
      audioCtx = null
    }
    ctx.destroy()
    onEnd()
  })
  ctx.onError(() => {
    if (audioCtx === ctx) {
      audioCtx = null
    }
    ctx.destroy()
    onEnd()
  })
  ctx.play()
}

export function stopAudio(): void {
  const ctx = audioCtx
  if (ctx != null) {
    audioCtx = null
    const onEnd = audioOnEnd
    audioOnEnd = null
    ctx.stop()
    ctx.destroy()
    // 被新播放顶替时也通知旧的调用方复位播放态
    if (onEnd != null) {
      onEnd()
    }
  }
}

// 导出文本文件（日志下载用）：H5 走 Blob + a[download]（resolve ''）；
// 小程序/App 写用户数据目录（resolve 文件路径）；失败 reject 由调用方兜底剪贴板。
// App 两个专属口径：
// 1) encoding 只能是 'utf-8'——App 的 FileSystemManager 只认 ascii/base64/utf-8，
//    传小程序惯用的 'utf8' 会直接 fail（错误码 1200002）；
// 2) App 的 USER_DATA_PATH 是应用沙盒（文件管理器不可见），返回路径只用于分享/回传，
//    不是「下载目录」；要取到文件得靠剪贴板或宿主自行 share/上传。
export function exportTextFile(filename: string, content: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // #ifdef WEB
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      resolve('')
    } catch (e) {
      reject(e)
    }
    // #endif
    // #ifndef WEB
    try {
      const fs = uni.getFileSystemManager()
      // 沙盒根目录缺失（基座缺 uni-fileSystemManager 模块等）时直接失败，别写出 "/xxx.txt" 这种坏路径
      const base = (uni.env.USER_DATA_PATH ?? '').replace(/\/+$/, '')
      if (base === '') {
        reject(new Error('USER_DATA_PATH unavailable'))
        return
      }
      const filePath = `${base}/${filename}`
      fs.writeFile({
        filePath,
        data: content,
        encoding: 'utf-8',
        success: () => resolve(filePath),
        fail: (e) => reject(new Error(e?.errMsg ?? 'writeFile fail'))
      })
    } catch (e) {
      reject(e)
    }
    // #endif
  })
}

// 剪贴板兜底（日志导出降级、复制类功能共用）：关闭原生提示，由调用方统一反馈；
// 空文本、同步异常与原生 fail 均 reject，避免伪造「已复制」成功提示
export function copyText(text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (text === '') {
      reject(new Error('copy text is empty'))
      return
    }
    try {
      uni.setClipboardData({
        data: text,
        showToast: false,
        success: () => resolve(),
        fail: (e) => {
          logger.warn('setClipboardData fail:', e?.errMsg ?? e)
          reject(new Error(e?.errMsg ?? 'setClipboardData fail'))
        }
      })
    } catch (e) {
      logger.warn('setClipboardData unavailable:', e)
      reject(e)
    }
  })
}

// ========== 附件下载 / 保存 ==========

/** 图片/视频保存到相册的结果 */
export interface EmMediaSaveResult {
  /** App/小程序下载到本地的临时路径；H5 浏览器下载为空串 */
  filePath: string
  /** 是否真正写入系统相册（H5 浏览器下载为 false） */
  savedToAlbum: boolean
}

/** 文件下载结果 */
export interface EmFileDownloadResult {
  /** App 为 USER_DATA_PATH 下补过扩展名的文件；小程序为临时文件；H5 浏览器下载为空串 */
  filePath: string
  fileName: string
}

let attachmentFileSeq = 0

/** 取文件扩展名（不含点，小写；无扩展名或异常字符返回空串） */
function extensionOfFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0 || dot === fileName.length - 1) return ''
  const ext = fileName.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

function errMsgOf(e: unknown): string {
  const msg = (e as { errMsg?: unknown } | null)?.errMsg
  return typeof msg === 'string' && msg !== '' ? msg : 'unknown error'
}

/** 相册权限拒绝的跨端兜底识别：App/小程序失败 errMsg 含 auth/deny/permission/authorize，或 errCode=1101005（未获取权限） */
export function isAlbumAuthDenied(e: unknown): boolean {
  const code = (e as { errCode?: unknown } | null)?.errCode
  if (code === 1101005 || code === '1101005') return true
  return /auth|denied|deny|permission|authorize/i.test(errMsgOf(e))
}

/**
 * H5 浏览器下载：同步创建 a[download] 并点击，不依赖 fetch（chatfiles 跨域时 fetch 会被 CORS 拦截）。
 * 跨域直链的 download 属性可能被浏览器忽略，此时由 target=_blank 交给浏览器预览/下载；
 * 文件名以响应头 Content-Disposition 为准，前端只能尽力指定。
 */
function downloadInBrowser(url: string, fileName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // #ifdef WEB
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.target = '_blank'
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      resolve()
    } catch (e) {
      reject(e)
    }
    // #endif
    // #ifndef WEB
    reject(new Error('browser download is only available on web'))
    // #endif
  })
}

/** App/小程序：uni.downloadFile 下载到临时文件，带进度回调 */
function downloadToTemp(url: string, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let task: ReturnType<typeof uni.downloadFile> | null = null
    try {
      task = uni.downloadFile({
        url,
        success: (res) => {
          const status = res.statusCode ?? 0
          const path = res.tempFilePath ?? ''
          if (status >= 200 && status < 300 && path !== '') {
            resolve(path)
            return
          }
          reject(new Error(`downloadFile fail: status ${status}`))
        },
        fail: (e) => {
          reject(new Error(errMsgOf(e)))
        }
      })
    } catch (e) {
      reject(e)
      return
    }
    if (task != null && onProgress != null) {
      task.onProgressUpdate((res) => {
        const percent = res.progress
        if (typeof percent === 'number' && percent >= 0 && percent <= 100) onProgress(percent)
      })
    }
  })
}

/**
 * App：把下载临时文件复制到 USER_DATA_PATH 并补扩展名。
 * uni.downloadFile 的临时路径可能没有扩展名，系统文档预览依赖扩展名；FSM 属可选 UTS 模块，
 * 缺失或复制失败时退回临时路径（openDocument 仍可能成功）。
 */
function copyToSandbox(tempPath: string, fileName: string): Promise<string> {
  // #ifdef APP
  return new Promise<string>((resolve) => {
    try {
      const base = (uni.env.USER_DATA_PATH ?? '').replace(/\/+$/, '')
      if (base === '') {
        resolve(tempPath)
        return
      }
      attachmentFileSeq += 1
      const ext = extensionOfFileName(fileName)
      const target = `${base}/em-attachment-${Date.now()}-${attachmentFileSeq}.${ext === '' ? 'bin' : ext}`
      uni.getFileSystemManager().copyFile({
        srcPath: tempPath,
        destPath: target,
        success: () => resolve(target),
        fail: (e) => {
          logger.warn('copy attachment to sandbox fail:', errMsgOf(e))
          resolve(tempPath)
        }
      })
    } catch (e) {
      logger.warn('copy attachment to sandbox unavailable:', e)
      resolve(tempPath)
    }
  })
  // #endif
  // #ifndef APP
  return Promise.resolve(tempPath)
  // #endif
}

/**
 * 图片/视频保存到相册：App/小程序 downloadFile + saveImageToPhotosAlbum / saveVideoToPhotosAlbum；
 * H5 浏览器下载（浏览器没有相册写入能力）。
 */
export function saveMediaToAlbum(
  url: string,
  fileName: string,
  kind: 'image' | 'video',
  onProgress?: (percent: number) => void
): Promise<EmMediaSaveResult> {
  // #ifdef WEB
  return downloadInBrowser(url, fileName).then(() => ({ filePath: '', savedToAlbum: false }))
  // #endif
  // #ifndef WEB
  return downloadToTemp(url, onProgress).then((tempPath) => new Promise<EmMediaSaveResult>((resolve, reject) => {
    const onSuccess = (): void => resolve({ filePath: tempPath, savedToAlbum: true })
    const onFail = (e: unknown): void => {
      const message = errMsgOf(e)
      logger.warn('save media to album fail:', message)
      reject(isAlbumAuthDenied(e) ? errorWithCode(ERROR_CODE.DOWNLOAD_AUTH_DENIED, message) : new Error(message))
    }
    try {
      if (kind === 'image') {
        uni.saveImageToPhotosAlbum({ filePath: tempPath, success: onSuccess, fail: onFail })
      } else {
        uni.saveVideoToPhotosAlbum({ filePath: tempPath, success: onSuccess, fail: onFail })
      }
    } catch (e) {
      onFail(e)
    }
  }))
  // #endif
}

/**
 * 文件下载：App/小程序下载到本地（App 复制到 USER_DATA_PATH 补扩展名）；H5 浏览器下载。
 * 调用方拿到 filePath 后按需 openDownloadedFile。
 */
export function downloadFileToLocal(
  url: string,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<EmFileDownloadResult> {
  // #ifdef WEB
  return downloadInBrowser(url, fileName).then(() => ({ filePath: '', fileName }))
  // #endif
  // #ifndef WEB
  return downloadToTemp(url, onProgress).then((tempPath) => {
    return copyToSandbox(tempPath, fileName).then((filePath) => ({ filePath, fileName }))
  })
  // #endif
}

/**
 * 尝试用系统文档预览打开本地文件（App/小程序）。
 * 只对 doc/docx/xls/xlsx/ppt/pptx/pdf 传 fileType；其余类型交给系统按扩展名尝试。
 * 打开失败 resolve false（下载本身已成功），由 UI 决定提示「已下载但无法打开」。
 */
export function openDownloadedFile(filePath: string, fileName: string): Promise<boolean> {
  // #ifdef WEB
  return Promise.resolve(false)
  // #endif
  // #ifndef WEB
  return new Promise<boolean>((resolve) => {
    const ext = extensionOfFileName(fileName)
    const fileType = OPEN_DOCUMENT_FILE_TYPES.indexOf(ext) >= 0 ? ext : ''
    try {
      uni.openDocument({
        filePath,
        fileType: fileType === '' ? undefined : fileType,
        showMenu: true,
        success: () => resolve(true),
        fail: (e) => {
          logger.warn('openDocument fail:', errMsgOf(e))
          resolve(false)
        }
      })
    } catch (e) {
      logger.warn('openDocument unavailable:', e)
      resolve(false)
    }
  })
  // #endif
}
