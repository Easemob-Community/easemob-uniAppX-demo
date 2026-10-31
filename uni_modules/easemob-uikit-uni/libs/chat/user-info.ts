import type { ChatClient, UserInfo, UserInfoManager } from 'easemob-websdk'
import { CONNECTION_STATUS } from '../constants'
import { connectionStore } from '../store/connection'
import { mergeUserInfo, userStore } from '../store/user'
import type { EmUserInfo } from '../types'

// 用户资料拉取（5.x UserInfoManager 封装）：
// 同一事件循环内的多次 ensureUserInfos 进队列，微任务 flush 合并去重后只发一次请求
// （对齐 vue 版 user-info-domain 的 fetchQueue 合批）；订阅（subscribeUsersInfo）一期不做
let client: ChatClient | null = null
let queue: string[] = []
let scheduled = false

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
  if (queue.length === 0 || scheduled) return
  scheduled = true
  Promise.resolve().then(() => {
    scheduled = false
    flush().catch(() => {})
  })
}

async function flush(): Promise<void> {
  const mgr = manager()
  if (mgr == null || queue.length === 0) return
  const ids = queue
  queue = []
  ids.forEach((id) => { userStore.loadingByUserId[id] = true })
  try {
    const users = await mgr.getUserInfoByAttribute({ userIds: ids, attributes: ['nickname', 'avatarUrl'] })
    // SDK 对未设置资料的用户也返回仅含 userId 的占位：写入空快照即视为已缓存，不再重拉
    users.forEach((u) => mergeUserInfo(normalize(u)))
    ids.forEach((id) => {
      if (userStore.infoByUserId[id] == null) mergeUserInfo({ userId: id, nickname: '', avatarUrl: '' })
    })
  } catch (e) {
    ids.forEach((id) => { userStore.failedByUserId[id] = true })
  } finally {
    ids.forEach((id) => { userStore.loadingByUserId[id] = false })
  }
}
