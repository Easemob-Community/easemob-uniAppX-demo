// 错误归因工具：网络预检测拦截 / 连接等待超时 / SDK 发送错误（审核拒绝、被拉黑、禁言等）统一收口。
// 抛出方挂 business code（ERROR_CODE）或 SDK 数字 code，消费方（chat 页 toast / 失败气泡）按 code 映射 i18n，
// 不靠错误文案匹配；文案匹配只作为无 code 时的兜底（SDK 未带 code 的旧路径/平台错误）。

import { ERROR_CODE } from '../constants'
import type { ErrorCodeValue } from '../constants'

/** 错误归因码：UIKit 业务码（字符串）或 SDK 数字错误码 */
export type EmErrorCode = ErrorCodeValue | number

export interface EmCodedError extends Error {
  code?: EmErrorCode
}

// SDK 被踢/账号失效类断开错误码（对齐 vue 版 KICK_ERROR_CODE）。
// onDisconnected 携带这些码时是账号态终态（SDK 不再自动重连），UI 应展示被踢文案而非网络异常
export const KICK_ERROR_CODE = {
  /** 当前账号在其他设备登录（互踢） */
  USER_LOGIN_ANOTHER_DEVICE: 206,
  /** 账号被服务端删除 */
  USER_REMOVED: 207,
  /** 登录设备数超过限制 */
  USER_LOGIN_TOO_MANY_DEVICES: 214,
  /** 修改密码导致被踢下线 */
  USER_KICKED_BY_CHANGE_PASSWORD: 216,
  /** 被其他设备主动踢下线 */
  USER_KICKED_BY_OTHER_DEVICE: 217
} as const

/** 断开/失败错误码是否属于被踢/账号失效终态 */
export function isKickErrorCode(code: unknown): code is number {
  return typeof code === 'number' && Number.isFinite(code)
    && (Object.values(KICK_ERROR_CODE) as number[]).includes(code)
}

/** 构造带业务错误码的 Error（走 Error 形态，不改变现有 catch/throw 结构） */
export function errorWithCode(code: ErrorCodeValue, message: string): EmCodedError {
  const err = new Error(message) as EmCodedError
  err.code = code
  return err
}

/** 读取未知错误的归因码：兼容 SDK 5.x 的数字 code 与 UIKit 字符串业务码；无 code 返回空串 */
export function errorCodeOf(e: unknown): EmErrorCode | '' {
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'string' && code !== '') {
    // 部分 SDK/网关把数字 code 序列化成字符串（'1200'）：按数字归因，避免整张映射表失效
    return /^\d+$/.test(code) ? Number(code) : (code as ErrorCodeValue)
  }
  if (typeof code === 'number' && Number.isFinite(code)) return code
  return ''
}

// SDK 错误码 → UIKit i18n key（对齐 vue 版 uikit-core/utils/sdk-error.ts 的高频子集）。
// 1200/1299 第三方内容审核失败；501 非法内容；508 外部逻辑拦截；222 被接收方拉黑；
// 221 不在好友列表；300 未连接；215/219 禁言；213/216-218 被踢/被顶。
const SDK_ERROR_CODE_I18N_MAP: Record<number, string> = {
  // 连接 / 网络
  1: 'error.unknown',
  2: 'error.network',
  300: 'error.notConnected',
  301: 'error.timeout',
  302: 'error.serverBusy',
  303: 'error.serverError',
  304: 'error.network',
  305: 'error.serviceNotEnabled',

  // 认证 / 权限 / 被踢 / 禁言
  100: 'error.unauthorized',
  107: 'error.invalidConversation',
  108: 'error.tokenExpired',
  110: 'error.validation',
  111: 'error.unsupported',
  200: 'error.unauthorized',
  201: 'error.unauthorized',
  202: 'error.unauthorized',
  204: 'error.notFound',
  210: 'error.forbidden',
  213: 'error.kicked',
  214: 'error.loginTooManyDevices',
  215: 'error.userMuted',
  216: 'error.kicked',
  217: 'error.kicked',
  218: 'error.kicked',
  219: 'error.userMutedByAdmin',
  220: 'error.deviceChanged',
  221: 'error.notOnRoster',
  222: 'error.messageBlockedByRecipient',

  // 文件 / 附件 / 上传
  400: 'error.fileNotFound',
  401: 'error.fileInvalid',
  402: 'error.uploadFailed',
  403: 'error.fileDownloadFailed',
  405: 'error.fileTooLarge',
  406: 'error.fileContentImproper',
  407: 'error.fileExpired',
  410: 'error.fileNotFound',
  411: 'error.fileTooLarge',

  // 消息相关
  500: 'error.internalError',
  501: 'error.illegalContent',
  502: 'error.trafficLimit',
  504: 'message.recall.timeLimit',
  505: 'error.serviceNotEnabled',
  506: 'error.messageExpired',
  508: 'error.contentBlocked',
  510: 'error.messageSizeLimit',

  // 群组（发送链路高频：被移出/禁言/不存在）
  600: 'error.groupInvalid',
  601: 'error.groupAlreadyJoined',
  602: 'error.groupNotJoined',
  603: 'error.groupPermissionDenied',
  604: 'error.groupMembersFull',
  606: 'error.groupNotExist',
  607: 'error.groupDisabled',
  613: 'error.groupUserInBlocklist',

  // 内容审核
  1200: 'error.moderationFailed',
  1299: 'error.moderationFailed'
}

/** 业务错误码 → i18n key（UIKit 自身抛出的网络/媒体类错误） */
function businessCodeMessageKey(code: ErrorCodeValue): string {
  if (code === ERROR_CODE.NETWORK_OFFLINE || code === ERROR_CODE.NETWORK_TIMEOUT) return 'error.network'
  if (code === ERROR_CODE.SEND_TIMEOUT) return 'error.timeout'
  if (code === ERROR_CODE.MEDIA_UNAVAILABLE) return 'error.mediaUnavailable'
  return ''
}

/** 归因码 → i18n key；未命中返回空串（接受宿主/消息对象上的宽 string 字段） */
export function errorMessageKeyOf(code: number | string | null | undefined): string {
  if (code == null || code === '') return ''
  if (typeof code === 'number') return SDK_ERROR_CODE_I18N_MAP[code] ?? ''
  return businessCodeMessageKey(code as ErrorCodeValue)
}

/** 失败气泡/toast 用：归因码 → 文案 key，未命中回落通用「发送失败」 */
export function sendFailureKeyOfCode(code: number | string | null | undefined): string {
  const key = errorMessageKeyOf(code)
  return key !== '' ? key : 'message.send.failed'
}

// 无 code 时的文案兜底：SDK/平台错误信息可能带这些片段（错误文案多语言下仅作最后一道）
function reasonMessageKeyOf(reason: string): string {
  const lower = reason.toLowerCase()
  if (
    lower.includes('not connected')
    || lower.includes('disconnected')
    || lower.includes('connection is closed')
    || lower.includes('websocket')
  ) {
    return 'error.notConnected'
  }
  if (
    lower.includes('network')
    || lower.includes('net::err')
    || lower.includes('failed to fetch')
    || lower.includes('network request failed')
  ) {
    return 'error.network'
  }
  if (lower.includes('timeout') || lower.includes('timed out')) return 'error.timeout'
  if (lower.includes('moderation') || lower.includes('illegal content') || lower.includes('content blocked')) {
    return 'error.moderationFailed'
  }
  return ''
}

function reasonOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e != null && typeof e === 'object') {
    const obj = e as { reason?: unknown; message?: unknown }
    if (typeof obj.reason === 'string') return obj.reason
    if (typeof obj.message === 'string') return obj.message
  }
  return ''
}

/** 发送失败归因：code 优先，其次错误文案，最后通用「发送失败」 */
export function sendFailureKeyOf(e: unknown): string {
  const codeKey = errorMessageKeyOf(errorCodeOf(e))
  if (codeKey !== '') return codeKey
  const reasonKey = reasonMessageKeyOf(reasonOf(e))
  return reasonKey !== '' ? reasonKey : 'message.send.failed'
}
