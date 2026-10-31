// SDK 模块获取层（PLAN.md M2.8）：全库唯一的 easemob-websdk 运行时导入收口。
// 非小程序端静态导入直通（现状等价，SDK 随宿主正常打包）；
// 小程序端 websdk 本体经普通分包承载（scripts/prepare-sdk-subpackage.mjs 构建期拷入 sub-sdk/），
// 此处经微信原生跨分包 require(path, cb, fail) 回调异步加载，主包不再含 SDK 静态依赖。
// 宿主可经 EmKitConfig.sdkLoader / sdkModule 覆盖加载来源（client init 时注入）。
import { createLogger } from '../utils/logger'

const logger = createLogger('sdk')

// SDK 模块形态：websdk 根入口导出中 UIKit 需要的运行时子集。
// typeof import 为纯类型查询，不产生运行时导入。
type SdkExports = typeof import('easemob-websdk')
export type EmSdkModule = Pick<
  SdkExports,
  | 'ChatClient'
  | 'ChatManager'
  | 'ContactManager'
  | 'GroupManager'
  | 'PushManager'
  | 'UserInfoManager'
  | 'setConsoleLogEnabled'
  | 'setLogLevel'
>

// #ifndef MP-WEIXIN
// 静态直通侧：sdkLoader/sdkModule 注入口为空实现——配置面跨端统一，宿主代码无需条件编译
import * as staticSdkModule from 'easemob-websdk'

const moduleRef: EmSdkModule = staticSdkModule as unknown as EmSdkModule

export function setSdkLoader(_loader: (() => Promise<unknown>) | null): void {}

export function setSdkModule(_mod: unknown): void {}

/** 非小程序端为微任务级直通（保持原同步导入语义，SDK 仍在宿主包内） */
export function ensureSdkModule(): Promise<EmSdkModule> {
  return Promise.resolve(moduleRef)
}
// #endif

// #ifdef MP-WEIXIN
let injectedLoader: (() => Promise<unknown>) | null = null
let injectedModule: unknown = null
let modulePromise: Promise<EmSdkModule> | null = null

const REQUIRED_EXPORTS = [
  'ChatClient',
  'ChatManager',
  'ContactManager',
  'GroupManager',
  'PushManager',
  'UserInfoManager',
  'setConsoleLogEnabled',
  'setLogLevel'
] as const

/** 宿主注入异步加载器（EmKitConfig.sdkLoader 接线）；传 null 恢复默认跨分包自加载 */
export function setSdkLoader(loader: (() => Promise<unknown>) | null): void {
  injectedLoader = loader
  modulePromise = null
}

/** 宿主注入已加载好的 SDK 模块（EmKitConfig.sdkModule 接线，loader 优先级的短路项） */
export function setSdkModule(mod: unknown): void {
  injectedModule = mod
  modulePromise = null
}

function validateSdkModule(mod: unknown): EmSdkModule {
  const record = (mod ?? {}) as Record<string, unknown>
  const missing = REQUIRED_EXPORTS.filter((name) => record[name] === undefined)
  if (missing.length > 0) {
    throw new Error(`IM SDK 模块缺少导出: ${missing.join(', ')}`)
  }
  return mod as EmSdkModule
}

// 默认分包路径相对编译产物中本文件：uni_modules/easemob-uikit-uni/libs/client/sdk.js → 产物根下 sub-sdk/
const DEFAULT_SUBPACKAGE_PATH = '../../../../sub-sdk/im-sdk.js'

function loadViaSubpackage(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    logger.info('loading IM SDK from subpackage:', DEFAULT_SUBPACKAGE_PATH)
    // @ts-ignore 微信模块作用域注入的 require（非 node/全局）；回调式三参为官方跨分包 JS 引用写法
    require(DEFAULT_SUBPACKAGE_PATH, (mod: unknown) => {
      resolve((mod as { default?: unknown })?.default ?? mod)
    }, (err: { errMsg?: string }) => {
      reject(new Error(`IM SDK 分包加载失败: ${err?.errMsg ?? JSON.stringify(err)}`))
    })
  })
}

/** 确保 SDK 模块就绪：Promise 缓存防并发重复加载，失败清缓存允许重试 */
export function ensureSdkModule(): Promise<EmSdkModule> {
  if (injectedModule != null) {
    const validated = validateSdkModule(injectedModule)
    injectedModule = validated
    return Promise.resolve(validated)
  }
  if (modulePromise != null) {
    return modulePromise
  }
  const loader = injectedLoader ?? loadViaSubpackage
  modulePromise = loader()
    .then((mod) => validateSdkModule((mod as { default?: unknown })?.default ?? mod))
    .catch((e) => {
      modulePromise = null
      logger.error('load IM SDK failed:', e)
      throw e
    })
  return modulePromise
}
// #endif
