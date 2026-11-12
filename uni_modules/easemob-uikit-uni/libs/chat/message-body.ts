import type {
  CustomMessageBody,
  FileMessageBody,
  ImageMessageBody,
  LocationMessageBody,
  TextMessageBody,
  VideoMessageBody,
  VoiceMessageBody
} from 'easemob-websdk'
import { MESSAGE_STATUS, MESSAGE_TYPE } from '../constants'
import type { EmMessageItem } from '../types'
import { multiBodyPreviewOf } from '../utils/multi-body'

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function applyMessageBody(item: EmMessageItem, wireType: string, wireBody: unknown, allowLocation = false): void {
  if (wireType === MESSAGE_TYPE.TEXT) {
    item.type = MESSAGE_TYPE.TEXT
    item.text = stringOf((wireBody as TextMessageBody)?.content)
  } else if (wireType === 'img' || wireType === MESSAGE_TYPE.IMAGE) {
    item.type = MESSAGE_TYPE.IMAGE
    const body = wireBody as ImageMessageBody
    const localUrl = stringOf(body?.localUrl)
    item.url = localUrl !== ''
      ? localUrl
      : (stringOf(body?.bigImageUrl) || stringOf(body?.originalImageUrl) || stringOf(body?.thumbnailUrl))
    item.thumbUrl = stringOf(body?.thumbnailUrl) || item.url
    item.originalUrl = stringOf(body?.originalImageUrl)
    item.isGif = body?.isGif === true
    item.width = numberOf(body?.width)
    item.height = numberOf(body?.height)
  } else if (wireType === 'voice' || wireType === MESSAGE_TYPE.AUDIO) {
    item.type = MESSAGE_TYPE.AUDIO
    const body = wireBody as VoiceMessageBody
    item.url = stringOf(body?.url)
    item.duration = numberOf(body?.duration)
  } else if (wireType === MESSAGE_TYPE.VIDEO) {
    item.type = MESSAGE_TYPE.VIDEO
    const body = wireBody as VideoMessageBody
    item.url = stringOf(body?.url)
    item.thumbUrl = stringOf(body?.thumbnailUrl)
    item.duration = numberOf(body?.duration)
    item.width = numberOf(body?.width)
    item.height = numberOf(body?.height)
  } else if (wireType === MESSAGE_TYPE.FILE) {
    item.type = MESSAGE_TYPE.FILE
    const body = wireBody as FileMessageBody
    item.url = stringOf(body?.url)
    item.fileName = stringOf(body?.filename)
    item.fileSize = numberOf(body?.fileSize) || numberOf(body?.fileLength)
  } else if (allowLocation && wireType === MESSAGE_TYPE.LOCATION) {
    item.type = MESSAGE_TYPE.LOCATION
    const body = wireBody as LocationMessageBody
    if (typeof body?.latitude === 'number') item.latitude = body.latitude
    if (typeof body?.longitude === 'number') item.longitude = body.longitude
    item.address = stringOf(body?.address)
    item.buildingName = stringOf(body?.buildingName)
  } else if (wireType === MESSAGE_TYPE.CUSTOM) {
    item.type = MESSAGE_TYPE.CUSTOM
    item.rawType = wireType
    const body = wireBody as CustomMessageBody
    item.customEvent = stringOf(body?.event)
    item.customParams = body?.params != null ? { ...body.params } : {}
  } else {
    item.type = MESSAGE_TYPE.OTHER
    item.rawType = wireType
  }
  const body = wireBody as Record<string, unknown> | null | undefined
  const secret = stringOf(body?.['secret'])
  if (secret !== '') item.attachmentSecret = secret
}

function displayParent(): EmMessageItem {
  return {
    id: '', localId: 'multi-body-preview', conversationId: '', chatType: 'singleChat',
    type: MESSAGE_TYPE.MULTI_BODY, text: '', url: '', thumbUrl: '', originalUrl: '', isGif: false,
    width: 0, height: 0, time: 0, from: '', to: '', self: false, status: MESSAGE_STATUS.SENT,
    quote: null, duration: 0, fileName: '', fileSize: 0, ext: {}, rawType: '', customEvent: '', customParams: {}
  }
}

export function toMultiBodySegmentItems(parent: EmMessageItem, wireBody: unknown): EmMessageItem[] {
  if (!Array.isArray(wireBody)) return []
  const segments: EmMessageItem[] = []
  wireBody.forEach((value, index) => {
    const body = value as Record<string, unknown> | null
    const wireType = stringOf(body?.['type'])
    const child: EmMessageItem = {
      ...parent,
      id: '',
      localId: `${parent.localId}:${index}`,
      type: MESSAGE_TYPE.OTHER,
      text: '',
      url: '',
      thumbUrl: '',
      originalUrl: '',
      isGif: false,
      width: 0,
      height: 0,
      status: MESSAGE_STATUS.SENT,
      quote: null,
      duration: 0,
      fileName: '',
      fileSize: 0,
      ext: { ...parent.ext },
      rawType: '',
      customEvent: '',
      customParams: {}
    }
    delete child.segments
    delete child.stream
    delete child.modifiedInfo
    delete child.pinned
    delete child.recalledBy
    delete child.failCode
    delete child.contentReplaced
    delete child.delivered
    delete child.uploadProgress
    delete child.groupReadCount
    delete child.attachmentSecret
    delete child.latitude
    delete child.longitude
    delete child.address
    delete child.buildingName
    applyMessageBody(child, wireType, body, true)
    segments.push(child)
  })
  return segments
}

export function multiBodyPreviewFromWire(wireBody: unknown, t: TranslateFn): string {
  return multiBodyPreviewOf(toMultiBodySegmentItems(displayParent(), wireBody), t)
}
