// 时间格式化（零依赖手写）：
// 会话列表五档（对齐 vue 版 createConversationTimeFormatter）：今天 HH:mm / 昨天 / 一周内周X / 今年 MM/DD / 往年 YYYY/MM/DD
// 聊天页分隔条四档（对齐 vue 版 formatDividerTime）：今天 HH:mm / 昨天 HH:mm / 前天 HH:mm / MM-DD HH:mm（跨年 YYYY-MM-DD HH:mm）
import { useLocale } from '../use/useLocale'

const WEEKDAY_KEYS = [
  'time.sunday',
  'time.monday',
  'time.tuesday',
  'time.wednesday',
  'time.thursday',
  'time.friday',
  'time.saturday'
]

const DAY_MS = 86400000

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

export function formatTimeHM(time: number): string {
  const d = new Date(time)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 视频/音频时长 m:ss（秒数取整、非负夹取，供气泡时长胶囊使用） */
export function formatVideoDuration(duration: number): string {
  const d = Math.max(0, Math.round(duration))
  const min = Math.floor(d / 60)
  return `${min}:${pad(d % 60)}`
}

export function formatConversationTime(time: number): string {
  if (time <= 0) return ''
  const { t } = useLocale()
  const d = new Date(time)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (time >= startOfToday) {
    return formatTimeHM(time)
  }
  if (time >= startOfToday - DAY_MS) {
    return t('time.yesterday')
  }
  if (time >= startOfToday - 6 * DAY_MS) {
    return t(WEEKDAY_KEYS[d.getDay()])
  }
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime()
  if (time >= startOfYear) {
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

// 用本地零点计算自然日差，避免跨时区/夏令时误差（对齐 vue 版 formatDividerTime）
export function formatDividerTime(time: number): string {
  if (time <= 0) return ''
  const { t } = useLocale()
  const d = new Date(time)
  const now = new Date()
  const timeStr = formatTimeHM(time)
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((nowDay - targetDay) / DAY_MS)
  if (diffDays === 0) return timeStr
  if (diffDays === 1) return `${t('time.yesterday')} ${timeStr}`
  if (diffDays === 2) return `${t('time.beforeYesterday')} ${timeStr}`
  const dateStr = d.getFullYear() === now.getFullYear()
    ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${dateStr} ${timeStr}`
}
