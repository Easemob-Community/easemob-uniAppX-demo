import { LOG_LEVEL } from '../constants'
import type { LogLevelValue } from '../constants'
import { uiConfig } from '../store/config'

// EmKit 内置日志服务：分级 + 命名空间前缀 + 有界内存环形缓冲，零依赖纯 ts。
// 所有级别（含被当前 level 过滤掉的）都进缓冲；控制台与导出共用截断后的文本。
// SDK 日志管理（setLogLevel/setConsoleLogEnabled/onLog 转发）在 libs/client init 时接线。

const ORDER: Record<LogLevelValue, number> = {
  [LOG_LEVEL.DEBUG]: 0,
  [LOG_LEVEL.INFO]: 1,
  [LOG_LEVEL.WARN]: 2,
  [LOG_LEVEL.ERROR]: 3,
  [LOG_LEVEL.SILENT]: 4
}

// 默认 info：关键节点（init/login/同步完成）可见，原始数据 dump 走 debug 需显式开
let currentLevel: LogLevelValue = LOG_LEVEL.INFO

const LOG_BUFFER_CAP = 2000
const LOG_BUFFER_CHAR_CAP = 256 * 1024
const LOG_LINE_CAP = 4096
const LOG_NAMESPACE_CAP = 128
const LOG_VALUE_DEPTH_CAP = 4
const LOG_VALUE_ITEMS_CAP = 50
const TRUNCATED_MARK = '…[truncated]'

const logBuffer: string[] = []
let logBufferHead = 0
let logBufferCount = 0
let logBufferChars = 0

interface FormatBudget {
  remaining: number
  truncated: boolean
}

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

/** SDK 原始 payload 日志（默认关闭）：只在显式开启且 debug 级别时进入有界序列化。 */
export function logPayload(logger: EmLogger, label: string, payload: unknown): void {
  if (!uiConfig.logPayload || ORDER[currentLevel] > ORDER[LOG_LEVEL.DEBUG]) return
  logger.debug(label, payload)
}

function takeText(text: string, budget: FormatBudget): string {
  if (budget.remaining <= 0) {
    budget.truncated = true
    return ''
  }
  if (text.length > budget.remaining) {
    const end = budget.remaining
    budget.truncated = true
    budget.remaining = 0
    return text.slice(0, end)
  }
  budget.remaining -= text.length
  return text
}

function stringifyArg(arg: unknown, budget: FormatBudget, depth = 0, ancestors: unknown[] = []): string {
  if (typeof arg === 'string') return takeText(arg, budget)
  if (arg instanceof Error) return takeText(`${arg.message}\n${arg.stack ?? ''}`, budget)
  if (arg == null || typeof arg !== 'object') {
    try {
      return takeText(String(arg), budget)
    } catch (e) {
      return takeText('[Unserializable]', budget)
    }
  }
  if (depth >= LOG_VALUE_DEPTH_CAP) {
    budget.truncated = true
    return takeText(Array.isArray(arg) ? '[Array]' : '[Object]', budget)
  }
  if (ancestors.indexOf(arg) >= 0) return takeText('[Circular]', budget)
  if (budget.remaining <= 0) {
    budget.truncated = true
    return ''
  }

  ancestors.push(arg)
  let text = ''
  try {
    if (Array.isArray(arg)) {
      text += takeText('[', budget)
      const count = Math.min(arg.length, LOG_VALUE_ITEMS_CAP)
      for (let i = 0; i < count && budget.remaining > 0; i++) {
        if (i > 0) text += takeText(',', budget)
        try {
          text += stringifyArg(arg[i], budget, depth + 1, ancestors)
        } catch (e) {
          text += takeText('[Unserializable]', budget)
        }
      }
      if (arg.length > count) budget.truncated = true
      text += takeText(']', budget)
    } else {
      text += takeText('{', budget)
      let count = 0
      let hasMore = false
      for (const key in arg) {
        if (!Object.prototype.hasOwnProperty.call(arg, key)) continue
        if (count >= LOG_VALUE_ITEMS_CAP || budget.remaining <= 0) {
          hasMore = true
          break
        }
        if (count > 0) text += takeText(',', budget)
        text += takeText('"', budget)
        text += takeText(key, budget)
        text += takeText('":', budget)
        try {
          text += stringifyArg((arg as Record<string, unknown>)[key], budget, depth + 1, ancestors)
        } catch (e) {
          text += takeText('[Unserializable]', budget)
        }
        count += 1
      }
      if (hasMore) budget.truncated = true
      text += takeText('}', budget)
    }
  } catch (e) {
    budget.truncated = true
  } finally {
    ancestors.pop()
  }
  return text
}

function formatArgs(args: unknown[], cap: number): { text: string, truncated: boolean } {
  const budget: FormatBudget = { remaining: cap, truncated: false }
  let text = ''
  let i = 0
  for (; i < args.length && budget.remaining > 0; i++) {
    if (i > 0) text += takeText(' ', budget)
    text += stringifyArg(args[i], budget)
  }
  if (i < args.length) budget.truncated = true
  return { text, truncated: budget.truncated }
}

function evictOldest(): void {
  if (logBufferCount <= 0) return
  const oldest = logBuffer[logBufferHead] ?? ''
  logBuffer[logBufferHead] = ''
  logBufferHead = (logBufferHead + 1) % LOG_BUFFER_CAP
  logBufferCount -= 1
  logBufferChars -= oldest.length
}

function pushBuffer(level: LogLevelValue, ns: string, args: unknown[]): string {
  const prefix = `[${new Date().toISOString()}] [${level}] [${ns}] `
  const contentCap = Math.max(0, LOG_LINE_CAP - prefix.length - TRUNCATED_MARK.length)
  const formatted = formatArgs(args, contentCap)
  const line = `${prefix}${formatted.text}${formatted.truncated ? TRUNCATED_MARK : ''}`
  while (logBufferCount > 0 && (logBufferCount >= LOG_BUFFER_CAP || logBufferChars + line.length > LOG_BUFFER_CHAR_CAP)) {
    evictOldest()
  }
  const index = (logBufferHead + logBufferCount) % LOG_BUFFER_CAP
  logBuffer[index] = line
  logBufferCount += 1
  logBufferChars += line.length
  return line
}

/** 导出缓冲日志全文（按时间序；总行数、单条与总字符数均有硬上限） */
export function getLogText(): string {
  const lines: string[] = []
  for (let i = 0; i < logBufferCount; i++) {
    lines.push(logBuffer[(logBufferHead + i) % LOG_BUFFER_CAP] ?? '')
  }
  return lines.join('\n')
}

export function getLogBufferSize(): number {
  return logBufferCount
}

export function clearLogBuffer(): void {
  logBuffer.length = 0
  logBufferHead = 0
  logBufferCount = 0
  logBufferChars = 0
}

export function createLogger(ns: string): EmLogger {
  const safeNs = ns.length > LOG_NAMESPACE_CAP ? ns.slice(0, LOG_NAMESPACE_CAP) : ns
  const prefix = `[emkit:${safeNs}]`
  return {
    debug(...args: unknown[]) {
      const line = pushBuffer(LOG_LEVEL.DEBUG, safeNs, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.DEBUG]) console.log(prefix, line)
    },
    info(...args: unknown[]) {
      const line = pushBuffer(LOG_LEVEL.INFO, safeNs, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.INFO]) console.info(prefix, line)
    },
    warn(...args: unknown[]) {
      const line = pushBuffer(LOG_LEVEL.WARN, safeNs, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.WARN]) console.warn(prefix, line)
    },
    error(...args: unknown[]) {
      const line = pushBuffer(LOG_LEVEL.ERROR, safeNs, args)
      if (ORDER[currentLevel] <= ORDER[LOG_LEVEL.ERROR]) console.error(prefix, line)
    }
  }
}
