import type { ChatClient, UserInfo, UserInfoManager } from 'easemob-websdk'
import { CONNECTION_STATUS, USER_INFO_REQUEST_BATCH_SIZE } from '../constants'
import { connectionStore } from '../store/connection'
import { clearUserInfoFetchFailures, mergeUserInfo, userStore } from '../store/user'
import type { EmUserInfo } from '../types'
import { getAccountEpoch, isAccountEpochCurrent } from './account'

// 用户资料拉取（5.x UserInfoManager 封装）：
// 同一事件循环内的多次 ensureUserInfos 微任务合批，单飞 flush 按 100 人串行分片；
// 单片失败只标记当前片，重连清失败标记并补拉；订阅（subscribeUsersInfo）一期不做
let client: ChatClient | null = null
let queue: string[] = []
let flushPromise: Promise<void> | null = null

function manager(): UserInfoManager | null {
  const c = client as unknown as { userInfoManager?: UserInfoManager } | null
  return c?.userInfoManager ?? null
}

// SDK wire 边界：历史数据可能带 4.x 小写 avatarurl，在此归一为 avatarUrl
function normalize(u: UserInfo): EmUserInfo {
  const raw = u as unknown as Record<string, unknown>
  const avatarUrl = typeof raw['avatarUrl'] === 'string'
    ? raw['avatarUrl'] as string
    : (typeof raw['avatarurl'] === 'string' ? raw['avatarurl'] as string : '')
  const nickname = typeof u.nickname === 'string' ? u.nickname : ''
  return { userId: u.userId, nickname, avatarUrl }
}

export function bindUserInfo(c: ChatClient): void {
  if (client != null) return
  client = c
  const mgr = manager()
  if (mgr == null) return
  mgr.addEventHandler('emkit-user-info', {
    onOwnInfoUpdated: (profile: UserInfo) => {
      mergeUserInfo(normalize(profile))
    },
    onUserInfoUpdated: (users: ReadonlyArray<UserInfo>) => {
      users.forEach((u) => mergeUserInfo(normalize(u)))
    }
  })
  c.addEventHandler('emkit-user-info-connection', {
    onConnected: () => {
      const retryIds = Object.keys(userStore.failedByUserId).filter((id) => userStore.failedByUserId[id] === true)
      if (retryIds.length === 0) return
      clearUserInfoFetchFailures(retryIds)
      // 等所有连接监听器同步更新 connectionStore 后再入队，避免依赖注册顺序
      Promise.resolve().then(() => ensureUserInfos(retryIds))
    }
  })
}

// 按需确保一批用户的昵称/头像已缓存；未登录或已缓存/加载中/已失败的 id 直接跳过
export function ensureUserInfos(userIds: string[]): void {
  if (client == null) return
  if (connectionStore.status !== CONNECTION_STATUS.ONLINE || connectionStore.userId === '') return
  userIds.forEach((id) => {
    if (id === '') return
    if (userStore.infoByUserId[id] != null || userStore.loadingByUserId[id] === true || userStore.failedByUserId[id] === true) return
    if (queue.indexOf(id) === -1) queue.push(id)
  })
  if (queue.length === 0) return
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushPromise != null) return
  flushPromise = Promise.resolve().then(() => flush()).catch(() => {}).finally(() => {
    flushPromise = null
    // flush 期间新入队的 ID 不与当前分片并发，当前轮结束后补排一轮
    if (queue.length > 0) scheduleFlush()
  })
}

async function flush(): Promise<void> {
  const mgr = manager()
  if (mgr == null || queue.length === 0) return
  const ids = queue
  queue = []
  const expectedEpoch = getAccountEpoch()
  // 整轮预占 loading：未来分片已在途，热更新再次 ensure 不得重复入队
  ids.forEach((id) => { userStore.loadingByUserId[id] = true })
  for (let i = 0; i < ids.length; i += USER_INFO_REQUEST_BATCH_SIZE) {
    if (!isAccountEpochCurrent(expectedEpoch)) return
    await fetchChunk(mgr, ids.slice(i, i + USER_INFO_REQUEST_BATCH_SIZE), expectedEpoch)
  }
}

async function fetchChunk(mgr: UserInfoManager, ids: string[], expectedEpoch: number): Promise<void> {
  try {
    const users = await mgr.getUserInfoByAttribute({ userIds: ids, attributes: ['nickname', 'avatarUrl'] })
    if (!isAccountEpochCurrent(expectedEpoch)) return
    // SDK 对未设置资料的用户也返回仅含 userId 的占位：写入空快照即视为已缓存，不再重拉
    users.forEach((u) => mergeUserInfo(normalize(u)))
    ids.forEach((id) => {
      if (userStore.infoByUserId[id] == null) mergeUserInfo({ userId: id, nickname: '', avatarUrl: '' })
    })
  } catch (e) {
    if (!isAccountEpochCurrent(expectedEpoch)) return
    ids.forEach((id) => { userStore.failedByUserId[id] = true })
  } finally {
    if (isAccountEpochCurrent(expectedEpoch)) {
      ids.forEach((id) => { userStore.loadingByUserId[id] = false })
    }
  }
}

// 登出时丢弃尚未出队的旧账号 ID；在途请求由账号代次阻止回写，完成后仍可调度新账号队列
export function resetUserInfoRequests(): void {
  queue = []
}
