import { MESSAGE_TYPE } from '../constants'
import type { EmMessageItem } from '../types'

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

export function multiBodyVisibleSegmentsOf(segments: readonly EmMessageItem[]): EmMessageItem[] {
  return segments.filter((segment) => segment.type !== MESSAGE_TYPE.TEXT || segment.text !== '')
}

export function multiBodyTextOf(segments: readonly EmMessageItem[]): string {
  return segments
    .filter((segment) => segment.type === MESSAGE_TYPE.TEXT && segment.text !== '')
    .map((segment) => segment.text)
    .join('\n')
}

export function multiBodyPreviewOf(segments: readonly EmMessageItem[], t: TranslateFn): string {
  const fallback = t('message.multiBody')
  const first = segments[0]
  if (first == null) return fallback
  let text = ''
  if (first.type === MESSAGE_TYPE.TEXT) {
    text = first.text
  } else if (first.type === MESSAGE_TYPE.IMAGE) {
    text = t('message.image')
  } else if (first.type === MESSAGE_TYPE.AUDIO) {
    text = t('message.audio')
  } else if (first.type === MESSAGE_TYPE.VIDEO) {
    text = t('message.video')
  } else if (first.type === MESSAGE_TYPE.FILE) {
    text = first.fileName !== '' ? first.fileName : t('message.file')
  } else if (first.type === MESSAGE_TYPE.LOCATION) {
    text = t('message.location')
  } else if (first.type === MESSAGE_TYPE.CUSTOM) {
    text = t('message.custom')
  }
  return text === '' ? fallback : `${text} ...`
}
