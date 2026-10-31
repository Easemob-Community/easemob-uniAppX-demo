import { reactive } from 'vue'
import { CONNECTION_STATUS } from '../constants'
import type { EmConnectionStatus } from '../types'

// 连接状态全局唯一 store（裸 reactive，零依赖）
export const connectionStore = reactive({
  status: CONNECTION_STATUS.IDLE as EmConnectionStatus,
  appkey: '',
  userId: '',
  /** 最近一次连接事件原因（SDK ConnectionEventReason 原值：login/reconnect/offline/token-expired/limit...） */
  reason: '',
  /** 最近一次断开/重连失败的错误码，0 = 无 */
  errorCode: 0,
  /** 当前是否处于自动重连中（status=reconnecting 时同步为 true） */
  reconnecting: false,
  /** 当前重连尝试次数（SDK payload.attempt，0 = 非重连） */
  reconnectAttempt: 0,
  /**
   * 系统网络是否可用（UI 预检测维度，先于 SDK 连接事件）：true=在线 / false=离线 / null=未知
   * （基座缺 uni-getNetworkType 模块或未探测过）。null 一律不预判，业务走原路径。
   */
  networkOnline: null as boolean | null,
  /** 被踢/账号失效终态：onDisconnected 命中被踢错误码（见 utils/error.ts KICK_ERROR_CODE）时为 true；
   * 重新登录成功、恢复在线或登出时清除 */
  kicked: false as boolean,
  /** 被踢错误码（kicked=true 时的 SDK errorCode，供 UI 按码分流文案），0 = 无 */
  kickCode: 0
})
