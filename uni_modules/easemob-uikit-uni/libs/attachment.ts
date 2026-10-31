// 附件能力注入层：UIKit 不静态依赖任何文件选择器 UTS 插件。
// App 端由宿主经 EmKit.setAttachmentProvider 注入 pick/resolve，UIKit 在用户点「文件」时
// 以 Promise 形式“通知”宿主选择附件；选中后的发送、失败重发、临时文件清理仍由 UIKit 统一管理。
// H5 / 小程序没有 provider 时回落到 platform.chooseFile 的内置实现。

import { reactive } from 'vue'
import { PLATFORM_CAPABILITIES, chooseFile } from './platform'
import type { EmPickedFile } from './platform'
import type {
  EmAttachment,
  EmAttachmentCapability,
  EmAttachmentPickOptions,
  EmAttachmentProvider
} from './types'
import { createLogger } from './utils/logger'

const logger = createLogger('attachment')

interface AttachmentProviderState {
  /** provider 当前是否可用（已注册且 isAvailable() !== false），驱动输入栏「文件」格显隐 */
  available: boolean
  providerName: string
}

// 只把“是否可用 / 名称”放进 reactive：provider 本身含函数，不做深层代理，避免 this/闭包被代理改写
const attachmentState = reactive<AttachmentProviderState>({
  available: false,
  providerName: ''
})

let provider: EmAttachmentProvider | null = null

function providerUsable(next: EmAttachmentProvider | null): boolean {
  if (next == null) return false
  if (next.isAvailable == null) return true
  try {
    return next.isAvailable()
  } catch (e) {
    logger.warn('attachment provider isAvailable failed:', e)
    return false
  }
}

/**
 * 注册/注销宿主附件能力（App 端文件选择器）。
 * 传 null 恢复内置行为；注册后输入栏「文件」格会自动出现（无需改 UIKit 代码）。
 */
export function setAttachmentProvider(next: EmAttachmentProvider | null): void {
  provider = next
  attachmentState.providerName = next == null ? '' : 'host'
  attachmentState.available = providerUsable(next)
}

/** provider 的可用性依赖外部状态（如云盘登录态）变化时，由宿主主动刷新显隐 */
export function refreshAttachmentAvailability(): void {
  attachmentState.available = providerUsable(provider)
}

/** 是否已注册宿主附件能力（不代表当前可用，可用性看 canPickAttachment） */
export function hasAttachmentProvider(): boolean {
  return provider != null
}

/**
 * 当前端是否可发起文件选择：内置能力（H5/小程序）或宿主已注入且可用的 provider。
 * 输入栏显隐与聊天页兜底门控统一读这里，不再直接读 PLATFORM_CAPABILITIES.filePick。
 */
export function canPickAttachment(): boolean {
  return PLATFORM_CAPABILITIES.filePick || attachmentState.available
}

/** 附件能力快照（EmKit.attachments 的响应式来源） */
export function attachmentCapability(): EmAttachmentCapability {
  return {
    available: canPickAttachment(),
    providerName: attachmentState.providerName
  }
}

function toPickedFile(item: EmAttachment): EmPickedFile {
  // provider 只承诺本地路径；webFile 仅内置 H5 选择器会带，这里显式补 null
  return {
    path: item.path,
    name: item.name,
    size: item.size,
    mimeType: item.mimeType,
    temporary: item.temporary,
    release: item.release,
    webFile: null
  }
}

/**
 * 发起附件选择：有宿主 provider 时通知宿主（带会话上下文），否则回落内置选择器。
 * 用户取消统一返回 []（不抛错）；provider 抛出的错误原样上抛，由聊天页 toast。
 */
export async function pickAttachments(options: EmAttachmentPickOptions): Promise<EmPickedFile[]> {
  if (provider != null && attachmentState.available) {
    const picked = await provider.pick(options)
    const files: EmPickedFile[] = []
    if (picked != null) {
      picked.forEach((item) => {
        files.push(toPickedFile(item))
      })
    }
    return files
  }
  // 内置实现仅 H5/小程序；App 未注册 provider 时 chooseFile 返回 null（入口已被 canPickAttachment 隐藏）
  const file = await chooseFile()
  return file == null ? [] : [file]
}

/**
 * 把外部 URI（分享进入/open-with/业务侧已有 URI）交给宿主 provider 转换为可发送附件。
 * 未注册 provider 或 provider 未实现 resolve 时返回 null。
 */
export async function resolveAttachment(uri: string, options?: EmAttachmentPickOptions): Promise<EmPickedFile | null> {
  if (provider == null || !attachmentState.available || provider.resolve == null) {
    return null
  }
  const item = await provider.resolve(uri, options)
  return item == null ? null : toPickedFile(item)
}
