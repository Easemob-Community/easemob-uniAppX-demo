// 流式消息状态判定（M2.13）：内核数据链路 / 渲染层 / 宿主插槽共用的纯函数。
// 不依赖 SDK 与 store，零运行时依赖；wire 状态值统一从 constants 的 STREAM_MESSAGE_STATUS 取。
import { STREAM_CUSTOM_TYPE, STREAM_MESSAGE_STATUS } from '../constants'
import type { StreamMessageStatusValue } from '../constants'
import type { EmStreamInfo } from '../types'

/** 流式是否处于传输中（未到终态）：展示打字机光标 */
export function isStreamActive(status: StreamMessageStatusValue | undefined): boolean {
  return status === STREAM_MESSAGE_STATUS.START
    || status === STREAM_MESSAGE_STATUS.IN_PROGRESS
}

/** 流式是否已到终态（正常完成 / 单分片完成 / 异常）：收敛为普通内容或异常提示 */
export function isStreamTerminal(status: StreamMessageStatusValue | undefined): boolean {
  return status === STREAM_MESSAGE_STATUS.COMPLETED
    || status === STREAM_MESSAGE_STATUS.START_COMPLETED
    || status === STREAM_MESSAGE_STATUS.ERROR
}

/** 是否内核内置的纯文本流（customType 缺省或 'text'）：光标/异常提示由 em-text-message 渲染 */
export function isPlainTextStream(stream: EmStreamInfo | undefined): boolean {
  if (stream == null) {
    return false
  }
  return stream.customType === '' || stream.customType === STREAM_CUSTOM_TYPE.TEXT
}

/** 是否需要宿主接管渲染（markdown 等富格式 customType）：em-chat-page 走 #stream-message 插槽 */
export function isRichStream(stream: EmStreamInfo | undefined): boolean {
  return stream != null && !isPlainTextStream(stream)
}
