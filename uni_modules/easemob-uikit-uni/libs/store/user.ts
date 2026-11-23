import { reactive } from 'vue'
import type { EmUserInfo, EmUserPresentation } from '../types'

// 用户属性缓存（裸 reactive，零依赖）：infoByUserId 按 userId 缓存昵称/头像；
// loadingByUserId/failedByUserId 为请求态标记——失败（含空结果占位已写 infoByUserId）不再自动重拉，防无限重试；
// overrideByUserId 为宿主业务注入（EmKit.setUserPresentation），displayNameOf/avatarOf 回落链最优先——
// SDK 资料回推只写 infoByUserId，永不触碰 override，宿主注入值不会被服务端资料冲掉
export const userStore = reactive({
  infoByUserId: {} as Record<string, EmUserInfo>,
  overrideByUserId: {} as Record<string, EmUserPresentation>,
  loadingByUserId: {} as Record<string, boolean>,
  failedByUserId: {} as Record<string, boolean>
})

// 合并写：部分字段推送不丢已有值；回写落在 reactive 代理上（AGENTS.md §4 响应式纪律）
export function mergeUserInfo(info: EmUserInfo): void {
  if (info.userId === '') return
  const prev = userStore.infoByUserId[info.userId]
  if (prev != null) {
    if (info.nickname !== '') prev.nickname = info.nickname
    if (info.avatarUrl !== '') prev.avatarUrl = info.avatarUrl
  } else {
    userStore.infoByUserId[info.userId] = { userId: info.userId, nickname: info.nickname, avatarUrl: info.avatarUrl }
  }
}

// 宿主业务注入：patch 按字段合并（undefined 不动现有值），null 清除该用户全部注入；空 userId 忽略
export function setUserPresentation(userId: string, patch: EmUserPresentation | null): void {
  if (userId === '') return
  if (patch == null) {
    delete userStore.overrideByUserId[userId]
    return
  }
  const next: EmUserPresentation = { ...userStore.overrideByUserId[userId] }
  if (patch.nickname !== undefined) next.nickname = patch.nickname
  if (patch.avatarUrl !== undefined) next.avatarUrl = patch.avatarUrl
  userStore.overrideByUserId[userId] = next
}

// 按字段撤销页面自己的注入：只有当前值仍等于 expected 时才清空，避免卸载误删宿主后写入的资料。
export function clearUserPresentationFields(userId: string, expected: EmUserPresentation): void {
  const current = userStore.overrideByUserId[userId]
  if (current == null) return
  const next: EmUserPresentation = { ...current }
  const fields = ['nickname', 'avatarUrl'] as const
  fields.forEach((field) => {
    const value = expected[field]
    if (value !== undefined && current[field] === value) next[field] = ''
  })
  const nicknameEmpty = next.nickname === undefined || next.nickname === ''
  const avatarEmpty = next.avatarUrl === undefined || next.avatarUrl === ''
  if (nicknameEmpty && avatarEmpty) {
    delete userStore.overrideByUserId[userId]
  } else {
    userStore.overrideByUserId[userId] = next
  }
}

// 展示名回落链（对齐 vue 版 useUserInfo）：业务注入 nickname > SDK nickname > fallback（conversation.name 等）> userId
// 联系人备注不参与本回落链（避免 store 交叉依赖），联系人场景见 libs/store/contact.ts 的 contactDisplayNameOf（remark > 本链）
export function displayNameOf(userId: string, fallback = ''): string {
  if (userId === '') return ''
  const override = userStore.overrideByUserId[userId]?.nickname
  if (override != null && override !== '') return override
  const nick = userStore.infoByUserId[userId]?.nickname ?? ''
  if (nick !== '') return nick
  if (fallback !== '' && fallback !== userId) return fallback
  return userId
}

export function avatarOf(userId: string): string {
  if (userId === '') return ''
  const override = userStore.overrideByUserId[userId]?.avatarUrl
  if (override != null && override !== '') return override
  return userStore.infoByUserId[userId]?.avatarUrl ?? ''
}

// 重连时允许失败项补拉；已成功缓存项仍由 ensureUserInfos 判重跳过
export function clearUserInfoFetchFailures(userIds?: string[]): void {
  if (userIds == null) {
    userStore.failedByUserId = {}
    return
  }
  userIds.forEach((id) => { delete userStore.failedByUserId[id] })
}

// 登出/换账号清空用户资料缓存（昵称/头像/请求态/业务注入均按账号隔离，宿主在 login 后重新注入）
export function clearUsers(): void {
  userStore.infoByUserId = {}
  userStore.overrideByUserId = {}
  userStore.loadingByUserId = {}
  userStore.failedByUserId = {}
}
