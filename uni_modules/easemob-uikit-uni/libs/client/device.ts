// SDK 设备信息解析：ChatClient.init 注入固定 deviceId（三段式 Platform_uikitVersion_uuid），
// 让服务端多端登录查询/互踢能按设备、平台与 UIKit 版本维度区分。
// 为降低合规风险，自动注入不读取或上报品牌、型号和系统版本，登录扩展名仅使用平台名。
//
// 三个前置事实（websdk 5.1.3 实测）：
// 1) ChatClient 是单例，重复 init 会按配置逐字段比对，deviceId 参与比对——
//    自动派生值必须会话内稳定，所以派生结果（含前缀的最终值）一经得出即持久化，
//    之后启动直接读回。
// 2) SDK 对 customOSPlatform 做 zod 校验：必须是 1–100 的整数（登录时进 proto 的
//    osCustomValue 字段），属于向环信注册过的业务自定义平台编号，UIKit 不能自造——
//    平台/版本维度由 deviceId 三段式承担；customOSPlatform 仅在宿主显式
//    传入合法编号（EmKitConfig.devicePlatform）时透传。
// 3) customDeviceName 是环信服务端按 appKey 开启的能力（默认关闭），UIKit 不设置。

import { getStorage, setStorage } from '../platform'
import { createLogger } from '../utils/logger'
import { UIKIT_VERSION } from '../constants'
import type { EmKitConfig } from '../types'
import { resolveLoginExtensionInfo } from './login-extension'

const logger = createLogger('client')

// deviceId 持久化 key（platform.ts 存储收口）；存的是「平台前缀 + 框架 deviceId/自生成 UUID」的最终值
const DEVICE_ID_STORAGE_KEY = 'emkit.device.id'

/** ChatClient.init 设备字段集合（字段均可空：空字段不注入，SDK 保持默认行为） */
export interface SdkDeviceInfo {
  deviceId?: string
  customOSPlatform?: number
  loginExtensionInfo?: string
  // 注入 deviceId 时恒为 false（见 resolveDeviceInfo 注释）；不注入时不出现，保持 SDK 默认
  useFixedDeviceId?: boolean
}

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

// 无依赖 UUID v4（零运行时依赖纪律）：仅作 deviceId 兜底，唯一性要求不高，Math.random 足够
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// uni.getDeviceInfo() 五端可用（Web 4.0+/小程序 4.41+/Android 3.9+/iOS 4.11+/鸿蒙 4.61+），
// 但旧基座/异常环境仍可能抛错或缺字段，调用与取字段都按 unknown 处理（先例 libs/use/useTheme.ts）
let cachedDeviceInfo: Record<string, unknown> | null = null

function readDeviceInfo(): Record<string, unknown> {
  if (cachedDeviceInfo != null) return cachedDeviceInfo
  let info: Record<string, unknown> = {}
  try {
    const raw: unknown = uni.getDeviceInfo({ filter: ['deviceId', 'platform', 'osName'] })
    if (raw != null && typeof raw === 'object') {
      info = raw as Record<string, unknown>
    }
  } catch (e) {}
  cachedDeviceInfo = info
  return info
}

// 归一平台名（deviceId 前缀与文档口径一致）：android / ios / harmonyos / web / mp-weixin。
// 微信小程序走条件编译直出；其余端由 uni.getDeviceInfo() 的 platform/osName 归一，
// 未识别的值原样小写返回（仍保证前缀存在），全部取不到时为 'unknown'。
function resolvePlatformName(): string {
  // #ifdef MP-WEIXIN
  return 'mp-weixin'
  // #endif
  // #ifndef MP-WEIXIN
  const info = readDeviceInfo()
  const raw = (asNonEmptyString(info.platform) !== '' ? asNonEmptyString(info.platform) : asNonEmptyString(info.osName)).toLowerCase()
  if (raw === '') return 'unknown'
  if (raw.indexOf('android') !== -1) return 'android'
  if (raw === 'ios' || raw.indexOf('iphone') !== -1 || raw.indexOf('ipad') !== -1) return 'ios'
  if (raw.indexOf('harmony') !== -1) return 'harmonyos'
  if (raw === 'web' || raw.indexOf('h5') !== -1) return 'web'
  return raw
  // #endif
}

// deviceId 解析（与文档口径一致）：
// 1. config.deviceId（宿主显式指定）：原样使用，不加任何段
// 2. 持久化值：仅读回当前三段式 Platform_uikitVersion_<id>，旧机型格式重新派生，避免继续上报历史设备型号
// 3. uni.getDeviceInfo().deviceId（框架生成并持久化的设备标识）：拼前缀后写入 key
// 4. 自生成 UUID 兜底：同样拼前缀后写入 key
function resolveDeviceId(config: EmKitConfig): string {
  const explicit = asNonEmptyString(config.deviceId)
  if (explicit !== '') return explicit
  const platform = resolvePlatformName()
  const stored = getStorage(DEVICE_ID_STORAGE_KEY)
  if (stored !== '') {
    const segments = stored.split('_')
    if (segments.length === 3 && segments[0] === platform && segments[1] === UIKIT_VERSION) return stored
  }
  const frameworkId = asNonEmptyString(readDeviceInfo().deviceId)
  const id = frameworkId !== '' ? frameworkId : generateUuid()
  if (frameworkId === '') {
    logger.info('deviceId: uni.getDeviceInfo() unavailable, generated uuid as fallback')
  }
  const finalId = `${platform}_${UIKIT_VERSION}_${id}`
  setStorage(DEVICE_ID_STORAGE_KEY, finalId)
  return finalId
}

// SDK 校验 customOSPlatform 为 1–100 整数（init 即校验，非法值直接抛错）。
// 宿主显式传的编号先做本地校验：非法值跳过注入并告警，不让一次笔误拖死 init。
function resolvePlatformCode(config: EmKitConfig): number | null {
  const code = config.devicePlatform
  if (code == null) return null
  if (Number.isInteger(code) && code >= 1 && code <= 100) return code
  logger.warn('devicePlatform invalid (SDK requires integer 1-100), skipped:', code)
  return null
}

/**
 * 解析 ChatClient.init 注入的设备信息。
 * enableDeviceInfo === false 时返回空对象（完全不注入，SDK 默认行为）；
 * 否则 deviceId 恒有值（显式值原样 / 自动派生为 Platform_uikitVersion_<id>，持久化保证跨启动稳定；
 * UIKit 升级后版本段变化，服务端会视为新设备），并同步带 useFixedDeviceId: false；
 * customOSPlatform 仅在宿主传入合法编号时出现；loginExtensionInfo 默认仅携带归一平台名。
 */
export function resolveDeviceInfo(config: EmKitConfig): SdkDeviceInfo {
  if (config.enableDeviceInfo === false) return {}
  const result: SdkDeviceInfo = {
    loginExtensionInfo: resolveLoginExtensionInfo({ platform: resolvePlatformName() })
  }
  const deviceId = resolveDeviceId(config)
  if (deviceId !== '') {
    result.deviceId = deviceId
    // websdk 5.1.3 buildDeviceInfo：useFixedDeviceId（init 缺省 true）会优先读 SDK 自己的
    // localStorage 历史值（key 'websdk2:device-info'），有值则完全忽略 init 传入的 deviceId——
    // H5 老用户因此出现双前缀 resourceId，注入不生效。注入 deviceId 时必须显式关掉它。
    // 注意只关 SDK 这一处持久化，我们自己的 emkit.device.id 读回逻辑不受影响。
    result.useFixedDeviceId = false
  }
  const platformCode = resolvePlatformCode(config)
  if (platformCode != null) result.customOSPlatform = platformCode
  return result
}
