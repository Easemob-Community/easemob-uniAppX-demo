import type { ChatClient, LogEntry, PlatformAdapterOverrides } from 'easemob-websdk'
import { CONNECTION_STATUS, ERROR_CODE, LOG_LEVEL } from '../constants'
import { connectionStore } from '../store/connection'
import { errorWithCode, isKickErrorCode } from '../utils/error'
import { applyKitConfig } from '../store/config'
import { setLocale } from '../use/useLocale'
import { subscribeNetworkStatus, checkNetworkOnce } from '../platform'
import { createLogger, setLogLevel } from '../utils/logger'
import type { EmKitConfig, EmLoginOptions, EmTokenRenewalResult } from '../types'
import { ensureSdkModule, setSdkLoader, setSdkModule } from './sdk'
import { resolveDeviceInfo } from './device'
import { canPickAttachment } from '../attachment'

const logger = createLogger('client')
// SDK onLog 转发出口（ns 独立，方便单独过滤 SDK 侧日志）
const sdkLogger = createLogger('sdk')
let voiceCapabilityWarned = false
let fileCapabilityWarned = false

function warnUnavailableFeatures(config: EmKitConfig): void {
  if (process.env.NODE_ENV !== 'production') {
    // #ifdef WEB
    if (config.inputFeatures?.voice === true && !voiceCapabilityWarned) {
      voiceCapabilityWarned = true
      logger.warn('inputFeatures.voice=true，但 H5 不提供语音入口')
    }
    // #endif
    // #ifdef APP
    if (config.inputFeatures?.file === true && !canPickAttachment() && !fileCapabilityWarned) {
      fileCapabilityWarned = true
      logger.warn('inputFeatures.file=true，但 App 尚无可用附件 provider，文件入口不会显示')
    }
    // #endif
  }
}

// ========== UI 侧系统网络感知（幂等单例） ==========
// SDK runtime 有自己的一路网络监听（喂重连循环），这一路独立注册只回写 connectionStore，
// 供 banner 先决显示与发送/登录预检测用；两路互不干扰，不合并。
let systemNetworkUnsub: (() => void) | null = null

function ensureSystemNetworkWatch(): void {
  if (systemNetworkUnsub != null) return
  systemNetworkUnsub = subscribeNetworkStatus((online) => {
    connectionStore.networkOnline = online
  })
  // onNetworkStatusChange 只在变化时回调，开局先探测一次写初值（null = 未知，不预判）
  void checkNetworkOnce().then((online) => {
    if (online !== null) {
      connectionStore.networkOnline = online
    }
  })
}

// 平台适配错误转一行日志：SDK 的 PlatformAdapterError 把真实原因放在 details/cause 里，
// 只打 message 会丢掉「哪一步、哪条路径、什么 errCode」
function platformErrorDetail(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const details = (e as { details?: Record<string, unknown> }).details
  if (details == null) return e.message
  try {
    return `${e.message} ${JSON.stringify(details)}`
  } catch (err) {
    return e.message
  }
}

// SDK 平台适配层覆盖（App 自定义基座兼容 + 附件上传降级，勿删）：
//
// 1) runtime：websdk 5.1.3 默认 runtime 适配器的 onNetworkChange 会顺手用 uni.getNetworkType 探测网络类型，
//    而 SDK 在建连（login → core 构造）阶段就注册网络监听。iOS/Android 旧自定义基座若没把
//    `uni-getNetworkType` UTS 模块编进去，这次**同步**调用直接抛
//    `undefined class: UTSSDKModulesDCloudUniGetNetworkTypeIndexSwift, uni-getNetworkType 模块不存在`，
//    用户侧看到的就是「登录失败」。这里把 runtime 换成只监听连通性、不探测网络类型的实现
//    （getNetworkType 在 SDK 里是可选能力，缺省即跳过）。
//
// 2) imageProcessor.computeMd5：SDK 用 `uni.getFileSystemManager().readFile` 算 md5，而 App 的 FSM
//    只认 uni 沙盒路径（uni.env.CACHE_PATH / USER_DATA_PATH / SANDBOX_PATH 等）。宿主文件选择器
//    常把副本放在系统缓存（iOS tmp、Android 内部 cache、鸿蒙内部 cache），readFile 直接 fail
//    （`Miniapp file read failed`）**整条附件消息失败**。md5 只用于服务端秒传预检（SDK 对缺能力的
//    平台也是「不传 md5 继续上传」），所以这里把它降级为空 md5 并留一行 warn，让上传走
//    `uni.uploadFile` 正常完成；图片宽高/大图（getImageInfo / generateBigImage）继续委托平台实现。
//
// 同时保持模块级单例，避免重复 init 时 SDK 按引用比对 platformAdapterOptions 判为配置冲突。
const SDK_PLATFORM_OVERRIDES = (defaults: Readonly<PlatformAdapterOverrides>): PlatformAdapterOverrides => {
  const runtime = defaults.runtime
  const processor = defaults.imageProcessor
  const runtimeOverride: PlatformAdapterOverrides['runtime'] = runtime == null
    ? undefined
    : {
        getPlatform: () => runtime.getPlatform(),
        onNetworkChange: (listener) => subscribeNetworkStatus(listener),
        onAppVisibilityChange: (listener) => runtime.onAppVisibilityChange(listener)
      }
  const processorOverride: PlatformAdapterOverrides['imageProcessor'] = processor == null
    ? undefined
    : {
        getImageInfo: (source) => processor.getImageInfo(source),
        generateBigImage: (source, options) => processor.generateBigImage(source, options),
        computeMd5: async (source) => {
          try {
            return await processor.computeMd5(source)
          } catch (e) {
            logger.warn('attachment md5 unavailable, upload continues without md5:', platformErrorDetail(e))
            return ''
          }
        }
      }
  // 不能让 runtime / imageProcessor 以 undefined 形式出现：SDK 按 key 覆盖默认适配器，
  // 显式 undefined 会把平台默认实现也抹掉（图片宽高/大图直接不可用）。
  return {
    ...(runtimeOverride == null ? {} : { runtime: runtimeOverride }),
    ...(processorOverride == null ? {} : { imageProcessor: processorOverride })
  }
}

// 客户端生命周期：初始化 / 登录 / 登出 / 连接事件
// 初始化三阶段（PLAN.md M2.8，对齐分包异步化指南）：SDK 模块加载（ensureSdkModule，
// 小程序分包场景异步）→ ChatClient.init → login，各阶段 Promise 缓存、失败清缓存可重试。
export class EmClient {
  private client: ChatClient | null = null
  private initPromise: Promise<ChatClient> | null = null
  // init 配置留存：Token 生命周期回调（onTokenWillExpire/onTokenExpired）在连接事件里消费
  private config: EmKitConfig | null = null

  init(config: EmKitConfig): void {
    if (this.initPromise != null) {
      return
    }
    this.config = config
    // UI 行为维度（draft/typing/菜单/输入栏功能集/品牌色等）与 uikit logger 级别保持同步生效；
    // SDK 侧日志管理（setSdkLogLevel/setConsoleLogEnabled 为 SDK 模块级函数）在模块就绪后接线
    applyKitConfig(config)
    setLogLevel(config.logLevel ?? LOG_LEVEL.INFO)
    warnUnavailableFeatures(config)
    if (config.locale != null) setLocale(config.locale)
    // 系统网络监听先挂上：登录前的离线也能被 banner/预检测感知（幂等，logout 不撤）
    ensureSystemNetworkWatch()
    // SDK 模块就绪门：非小程序端为微任务级直通，小程序分包场景为真实异步
    this.initPromise = this.doInit(config)
  }

  /** client 就绪门：所有依赖 SDK 的入口先经此等待；未 init 时 reject（保持「call EmKit.init() first」语义） */
  whenReady(): Promise<ChatClient> {
    if (this.initPromise == null) {
      return Promise.reject(new Error('call EmKit.init() first'))
    }
    return this.initPromise
  }

  private async doInit(config: EmKitConfig): Promise<ChatClient> {
    try {
      // 宿主可经 EmKitConfig.sdkLoader/sdkModule 覆盖 SDK 来源（如自管理分包加载与预下载）
      if (config.sdkLoader != null) {
        setSdkLoader(config.sdkLoader)
      }
      if (config.sdkModule != null) {
        setSdkModule(config.sdkModule)
      }
      const sdk = await ensureSdkModule()
      // SDK 自身日志管理（模块级函数，非 client 方法）
      sdk.setLogLevel(config.sdkLogLevel ?? 'WARN')
      sdk.setConsoleLogEnabled(config.sdkConsoleLog !== false)
      const client = sdk.ChatClient.init({
        appKey: config.appkey,
        // 固定设备标识注入：deviceId 派生值持久化、会话内稳定，注入时同步关 SDK useFixedDeviceId
        // （避免 SDK 本地历史值覆盖注入值）；解析细节见 ./device.ts
        ...resolveDeviceInfo(config),
        // 登录后自动同步会话 + 联系人 + 群（SDK 默认只同步 conversation，contact/group 需显式选择——
        // 未选时 getContacts()/getJoinedGroupList() 只能读到本地缓存残留，小程序端即「永远空」的根因；
        // 对齐 vue 版 uikit-im 场景默认 ['conversation','contact','group']）。
        // enableSyncData 与 managers 必须成对：含 'group' 而未注册 GroupManager 会直接抛错
        enableSyncData: ['conversation', 'contact', 'group'],
        managers: [sdk.ChatManager, sdk.PushManager, sdk.UserInfoManager, sdk.ContactManager, sdk.GroupManager],
        // 网络监听改为不依赖 uni-getNetworkType 模块（见上方 SDK_PLATFORM_OVERRIDES 注释）
        platformAdapterOptions: { overrides: SDK_PLATFORM_OVERRIDES }
      })
      // SDK 结构化日志（已脱敏）统一转发进 uikit logger：sdkConsoleLog 关闭后此通道仍在，
      // 业务侧只需盯 `emkit:` 前缀一条日志 funnel
      client.addEventHandler('emkit-log', {
        onLog: (entry: LogEntry) => {
          if (entry.level === 'DEBUG') {
            sdkLogger.debug(entry.message, ...entry.args)
          } else if (entry.level === 'WARN') {
            sdkLogger.warn(entry.message, ...entry.args)
          } else {
            sdkLogger.error(entry.message, ...entry.args)
          }
        }
      })
      client.addEventHandler('emkit-connection', {
        // 首次连接 vs 自动重连：attempt>0 视为重连，宿主可据此显示「连接中/重连中」
        onConnecting: (payload) => {
          const attempt = payload.attempt ?? 0
          const reconnecting = attempt > 0
          connectionStore.status = reconnecting ? CONNECTION_STATUS.RECONNECTING : CONNECTION_STATUS.CONNECTING
          connectionStore.reconnecting = reconnecting
          connectionStore.reconnectAttempt = attempt
          connectionStore.reason = payload.reason
        },
        onConnected: (payload) => {
          connectionStore.status = CONNECTION_STATUS.ONLINE
          connectionStore.reason = payload.reason
          connectionStore.errorCode = 0
          connectionStore.reconnecting = false
          connectionStore.reconnectAttempt = 0
          connectionStore.kicked = false
          connectionStore.kickCode = 0
          logger.info('connected')
        },
        onDisconnected: (payload) => {
          connectionStore.status = CONNECTION_STATUS.CLOSED
          connectionStore.reason = payload.reason
          connectionStore.errorCode = payload.errorCode ?? 0
          connectionStore.reconnecting = false
          // 被踢/账号失效（206/207/214/216/217）是账号态终态，SDK 不再自动重连：
          // 打 kicked 标记，banner 据此展示被踢文案而非兜底「网络异常」（对齐 vue 版）
          if (isKickErrorCode(payload.errorCode)) {
            connectionStore.kicked = true
            connectionStore.kickCode = payload.errorCode
          }
          logger.warn('disconnected:', payload.reason, payload.errorCode ?? 0)
        },
        // 自动重连达到上限：状态落 CLOSED，原因/错误码透出给宿主做「重新登录/检查网络」引导
        onReconnectFailed: (payload) => {
          connectionStore.status = CONNECTION_STATUS.CLOSED
          connectionStore.reason = payload.reason
          connectionStore.errorCode = payload.errorCode ?? 0
          connectionStore.reconnecting = false
          logger.warn('reconnect failed:', payload.reason, payload.errorCode ?? 0)
        },
        // Token 生命周期：约 80% 生命周期触发续期；过期时回落宿主回调（通常跳登录页）
        onTokenWillExpire: () => {
          void this.handleTokenWillExpire()
        },
        onTokenExpired: () => {
          connectionStore.status = CONNECTION_STATUS.CLOSED
          connectionStore.reason = 'token-expired'
          connectionStore.reconnecting = false
          logger.warn('token expired')
          try {
            this.config?.onTokenExpired?.()
          } catch (e) {
            logger.error('onTokenExpired handler fail:', e)
          }
        }
      })
      connectionStore.appkey = config.appkey
      this.client = client
      logger.info('init ok, appkey:', config.appkey)
      return client
    } catch (e) {
      // 失败清缓存（如分包首次加载失败）：宿主修正后可重新 init 重试
      this.initPromise = null
      logger.error('init failed:', e)
      throw e
    }
  }

  get raw(): ChatClient | null {
    return this.client
  }

  /** Token 续期（宿主拿服务端新 token 后调用；配置了 EmKitConfig.onTokenWillExpire 时 UIKit 自动调） */
  async renewToken(token: string): Promise<EmTokenRenewalResult> {
    const client = await this.whenReady()
    const result = await client.renewToken(token)
    return { token: result.token, expireAt: result.expireAt }
  }

  // onTokenWillExpire 续期：回调返回新 token 才 renew；失败只记录，SDK 仍会在过期时触发 onTokenExpired
  private async handleTokenWillExpire(): Promise<void> {
    const handler = this.config?.onTokenWillExpire
    if (handler == null) {
      logger.warn('token will expire: no onTokenWillExpire handler, call EmKit.renewToken manually')
      return
    }
    try {
      const token = await handler()
      if (typeof token !== 'string' || token === '') {
        logger.warn('onTokenWillExpire returned empty token, skip renew')
        return
      }
      await this.renewToken(token)
      logger.info('token renewed')
    } catch (e) {
      logger.error('token renew failed:', e)
    }
  }

  async login(options: EmLoginOptions): Promise<void> {
    const client = await this.whenReady()
    connectionStore.status = CONNECTION_STATUS.CONNECTING
    connectionStore.reason = ''
    connectionStore.errorCode = 0
    connectionStore.reconnecting = false
    connectionStore.reconnectAttempt = 0
    try {
      await client.login({ userId: options.userId, token: options.token })
      connectionStore.userId = options.userId
      connectionStore.status = CONNECTION_STATUS.ONLINE
      connectionStore.kicked = false
      connectionStore.kickCode = 0
      logger.info('login success:', options.userId)
    } catch (e) {
      connectionStore.status = CONNECTION_STATUS.CLOSED
      // 系统离线标记：登录失败的排查第一问通常是「是不是没网」，这里直接留痕，不改抛出值
      logger.error('login failed:', options.userId, connectionStore.networkOnline === false ? '(system offline)' : '', e)
      throw e
    }
  }

  async logout(): Promise<void> {
    if (this.client == null) {
      return
    }
    await this.client.logout()
    connectionStore.status = CONNECTION_STATUS.CLOSED
    connectionStore.userId = ''
    connectionStore.reason = ''
    connectionStore.errorCode = 0
    connectionStore.reconnecting = false
    connectionStore.reconnectAttempt = 0
    connectionStore.kicked = false
    connectionStore.kickCode = 0
  }

  // login resolve ≠ socket 就绪：发送/拉历史前统一等 onConnected
  waitOnline(timeout = 8000): Promise<void> {
    if (connectionStore.userId === '') {
      return Promise.reject(errorWithCode(ERROR_CODE.UNAUTHORIZED, 'login required'))
    }
    if (connectionStore.status === CONNECTION_STATUS.ONLINE) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const start = Date.now()
      const timer = setInterval(() => {
        if (connectionStore.userId === '') {
          clearInterval(timer)
          reject(errorWithCode(ERROR_CODE.UNAUTHORIZED, 'login required'))
        } else if (connectionStore.status === CONNECTION_STATUS.ONLINE) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - start > timeout) {
          clearInterval(timer)
          reject(errorWithCode(ERROR_CODE.NETWORK_TIMEOUT, 'waitOnline timeout'))
        }
      }, 100)
    })
  }
}
