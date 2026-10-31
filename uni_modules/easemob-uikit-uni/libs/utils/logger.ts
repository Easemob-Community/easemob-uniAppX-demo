import { LOG_LEVEL } from '../constants'
import type { LogLevelValue } from '../constants'
import { uiConfig } from '../store/config'

// EmKit 内置日志服务：分级 + 命名空间前缀 + 内存环形缓冲导出，零依赖纯 ts。
// 用法：模块顶部 `const logger = createLogger('chat')`，输出形如 `[emkit:chat] ...`，
// 控制台统一按 `emkit:` 过滤即可。SDK 日志管理（setLogLevel/setConsoleLogEnabled/
// onLog 转发）在 libs/client init 时接线，不走本模块。
//
// 环形缓冲与 console 输出解耦：所有级别（含被当前 level 过滤掉的）都进缓冲，
// 便于「界面静默、事后导出全量」的排查姿势；导出走 getLogText + platform.exportTextFile。

const ORDER: Record<LogLevelValue, number> = {
  [LOG_LEVEL.DEBUG]: 0,
  [LOG_LEVEL.INFO]: 1,
  [LOG_LEVEL.WARN]: 2,
  [LOG_LEVEL.ERROR]: 3,
  [LOG_LEVEL.SILENT]: 4
}

// 默认 info：关键节点（init/login/同步完成）可见，原始数据 dump 走 debug 需显式开
let currentLevel: LogLevelValue = LOG_LEVEL.INFO

/** 内存环形缓冲容量（行）；超出后丢最老行，防长时间运行内存膨胀 */
const LOG_BUFFER_CAP = 2000
const logBuffer: string[] = []

export interface EmLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export function setLogLevel(level: LogLevelValue): void {
  currentLevel = level
}

export function getLogLevel(): LogLevelValue {
  return currentLevel
}

/**
 * SDK 原始 payload 日志（默认关闭）：只有宿主显式 `logPayload: true` 且日志级别为 debug 时才序列化。
 * 避免 debug 关闭时仍对同步快照/好友资料做 eager JSON clone，也避免生产导出日志包含 userId/昵称。
 */
export function logPayload(logger: EmLogger, label: string, payload: unknown): void {
  if (!uiConfig.logPayload || ORDER[currentLevel] > ORDER[LOG_LEVEL.DEBUG]) return
  let clone: unknown = payload
  try {
    clone = JSON.parse(JSON.stringify(payload))
  } catch (e) {
    clone = String(payload)
  }
  logger.debug(label, clone)
}

// 缓冲行序列化：Error 取 message+stack，对象走 JSON（循环引用兜底 String）
function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`
  try {
    return JSON.stringify(arg)
  } catch (e) {
    return String(arg)
  }
}

function pushBuffer(level: LogLevelValue, ns: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] [${ns}] ${args.map(stringifyArg).join(' ')}`
  if (logBuffer.length >= LOG_BUFFER_CAP) {
    logBuffer.shift()
  }
  logBuffer.push(line)
}

/** 导出缓冲日志全文（按时间序，一行一条） */
export function getLogText(): string {
  return logBuffer.join('\n')
}

export function getLogBufferSize(): number {
  return logBuffer.length
}

export function clearLogBuffer(): void {
  logBuffer.length = 0
}

export function createLogger(ns: string): EmLogger {
  const prefix = `[emkit:${ns}]`
  return {
    // debug 走 console.log：小程序/蒸汽端对 console.debug 的过滤支持不一致，log 全端稳定
    debug(...args: unknown[]) {
      pushBuffer(LOG_LEVEL.DEBUG, ns, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.DEBUG]) console.log(prefix, ...args)
    },
    info(...args: unknown[]) {
      pushBuffer(LOG_LEVEL.INFO, ns, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.INFO]) console.info(prefix, ...args)
    },
    warn(...args: unknown[]) {
      pushBuffer(LOG_LEVEL.WARN, ns, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.WARN]) console.warn(prefix, ...args)
    },
    error(...args: unknown[]) {
      pushBuffer(LOG_LEVEL.ERROR, ns, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.ERROR]) console.error(prefix, ...args)
    }
  }
}
