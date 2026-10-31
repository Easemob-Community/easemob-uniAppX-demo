import { reactive } from 'vue'
import { GROUP_MEMBER_ROLE } from '../constants'
import type { GroupMemberRoleValue } from '../constants'
import type { EmGroup, EmGroupMember, EmGroupPresentation } from '../types'
import { displayNameOf } from './user'

// 群数据 store（裸 reactive，零依赖）：
// items 为已加入群快照（SDK 后台同步 + getJoinedGroupList 整量回写）；
// infoByGroupId 为群详情缓存（含 items 全量 + getGroupInfo 单群详情合并）；
// memberMapByGroupId 为成员游标分页累积缓存；announcementByGroupId undefined=未拉取、空串=已拉无公告；
// overrideByGroupId 为宿主业务注入（EmKit.setGroupPresentation）：name/avatar 优先于 SDK 群资料，ext 随插槽 scope 透出
export const groupStore = reactive({
  items: [] as EmGroup[],
  overrideByGroupId: {} as Record<string, EmGroupPresentation>,
  loaded: false,
  syncing: false,
  syncFailed: false,
  infoByGroupId: {} as Record<string, EmGroup>,
  memberMapByGroupId: {} as Record<string, EmGroupMember[]>,
  announcementByGroupId: {} as Record<string, string | undefined>,
  memberCursorByGroupId: {} as Record<string, string>,
  memberHasMoreByGroupId: {} as Record<string, boolean>,
  // 已补拉过管理员列表的群（成员列表接口不回 admin 角色，首屏后单独拉取合并，避免切会话重复拉）
  adminSyncedByGroupId: {} as Record<string, boolean>
})

// 宿主业务注入：patch 按字段合并（undefined 不动现有值），null 清除该群全部注入；空 id 忽略
export function setGroupPresentation(groupId: string, patch: EmGroupPresentation | null): void {
  if (groupId === '') return
  if (patch == null) {
    delete groupStore.overrideByGroupId[groupId]
    return
  }
  const next: EmGroupPresentation = { ...groupStore.overrideByGroupId[groupId] }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.avatar !== undefined) next.avatar = patch.avatar
  if (patch.ext !== undefined) next.ext = patch.ext
  groupStore.overrideByGroupId[groupId] = next
}

/** 群展示名回落链：业务注入 name > infoByGroupId.name > groupId */
export function groupDisplayNameOf(groupId: string): string {
  const override = groupStore.overrideByGroupId[groupId]?.name
  if (override != null && override !== '') return override
  const name = groupStore.infoByGroupId[groupId]?.name
  return name != null && name !== '' ? name : groupId
}

/** 群头像回落链：业务注入 avatar > infoByGroupId.avatar > 空串（缺失走 em-avatar 文字占位） */
export function groupAvatarOf(groupId: string): string {
  const override = groupStore.overrideByGroupId[groupId]?.avatar
  if (override != null && override !== '') return override
  return groupStore.infoByGroupId[groupId]?.avatar ?? ''
}

// 群消息发送者昵称回落链（气泡上方昵称行）：群成员名片 > userStore 昵称 > userId
export function groupMemberDisplayNameOf(groupId: string, userId: string): string {
  const member = groupStore.memberMapByGroupId[groupId]?.find((m) => m.userId === userId)
  const nick = member?.nick ?? ''
  if (nick !== '') return nick
  return displayNameOf(userId)
}

// 已加入群整量回写：同时并入详情缓存（回写落 reactive 代理：整表替换即可）
export function setJoinedGroups(groups: EmGroup[], authoritative = true): void {
  groupStore.items = groups
  groups.forEach((g) => {
    groupStore.infoByGroupId[g.groupId] = g
  })
  if (authoritative) groupStore.loaded = true
}

// 单群详情合并：items 有则原位更新（代理上 patch 字段），无则追加；详情缓存恒整对象替换；
// toFront=true 时新群插到列表头部（建群本地回显置顶的产品决策，见 STATUS 2026-10-16；
// getJoinedGroups 全量刷新后顺序仍以 SDK 返回为准）
export function upsertGroup(group: EmGroup, toFront = false): void {
  const existing = groupStore.items.find((g) => g.groupId === group.groupId)
  if (existing != null) {
    existing.name = group.name
    existing.description = group.description
    existing.owner = group.owner
    existing.memberCount = group.memberCount
    existing.maxUsers = group.maxUsers
    existing.avatar = group.avatar
    existing.public = group.public
    existing.approval = group.approval
    existing.allowInvites = group.allowInvites
    existing.inviteNeedConfirm = group.inviteNeedConfirm
    existing.mute = group.mute
    existing.disabled = group.disabled
  } else if (toFront) {
    groupStore.items.unshift(group)
  } else {
    groupStore.items.push(group)
  }
  groupStore.infoByGroupId[group.groupId] = group
}

export function updateGroup(groupId: string, patch: Partial<EmGroup>): void {
  const apply = (g: EmGroup): void => {
    if (patch.name != null) g.name = patch.name
    if (patch.description != null) g.description = patch.description
    if (patch.owner != null) g.owner = patch.owner
    if (patch.memberCount != null) g.memberCount = patch.memberCount
    if (patch.maxUsers != null) g.maxUsers = patch.maxUsers
    if (patch.avatar !== undefined) g.avatar = patch.avatar
    if (patch.public != null) g.public = patch.public
    if (patch.approval != null) g.approval = patch.approval
    if (patch.allowInvites != null) g.allowInvites = patch.allowInvites
    if (patch.inviteNeedConfirm != null) g.inviteNeedConfirm = patch.inviteNeedConfirm
    if (patch.mute != null) g.mute = patch.mute
    if (patch.disabled != null) g.disabled = patch.disabled
  }
  const item = groupStore.items.find((g) => g.groupId === groupId)
  if (item != null) apply(item)
  const info = groupStore.infoByGroupId[groupId]
  if (info != null && info !== item) apply(info)
}

export function incrementMemberCount(groupId: string, delta: number): void {
  const apply = (g: EmGroup): void => {
    g.memberCount = Math.max(0, g.memberCount + delta)
  }
  const item = groupStore.items.find((g) => g.groupId === groupId)
  if (item != null) apply(item)
  const info = groupStore.infoByGroupId[groupId]
  if (info != null && info !== item) apply(info)
}

export function removeGroup(groupId: string): void {
  groupStore.items = groupStore.items.filter((g) => g.groupId !== groupId)
  delete groupStore.infoByGroupId[groupId]
  delete groupStore.memberMapByGroupId[groupId]
  delete groupStore.announcementByGroupId[groupId]
  delete groupStore.memberCursorByGroupId[groupId]
  delete groupStore.memberHasMoreByGroupId[groupId]
  delete groupStore.adminSyncedByGroupId[groupId]
}

// 成员整量回写（首页）：角色权威修正——owner 以 group.owner 为唯一权威
// （防服务端延迟同步导致 admin/owner 角色闪回）；已缓存的 admin 角色同样保留不回退
export function setGroupMembers(groupId: string, members: EmGroupMember[]): void {
  const existing = groupStore.memberMapByGroupId[groupId] ?? []
  const cachedRoleByUserId: Record<string, GroupMemberRoleValue> = {}
  existing.forEach((m) => {
    cachedRoleByUserId[m.userId] = m.role
  })
  const owner = groupStore.infoByGroupId[groupId]?.owner ?? ''
  groupStore.memberMapByGroupId[groupId] = members.map((m) => {
    if (owner !== '') {
      if (m.userId === owner) {
        return { ...m, role: GROUP_MEMBER_ROLE.OWNER }
      }
      if (m.role === GROUP_MEMBER_ROLE.OWNER) {
        return { ...m, role: GROUP_MEMBER_ROLE.MEMBER }
      }
    }
    const cached = cachedRoleByUserId[m.userId]
    if (cached === GROUP_MEMBER_ROLE.ADMIN && m.role === GROUP_MEMBER_ROLE.MEMBER) {
      return { ...m, role: cached }
    }
    return m
  })
}

// 追加成员（后续页）：按 userId 去重，保持服务端原顺序（分页 append 依赖原顺序）
export function appendGroupMembers(groupId: string, members: EmGroupMember[]): void {
  const existing = groupStore.memberMapByGroupId[groupId] ?? []
  const existingIds: Record<string, boolean> = {}
  existing.forEach((m) => {
    existingIds[m.userId] = true
  })
  const appended = [...existing]
  members.forEach((m) => {
    if (!existingIds[m.userId]) {
      appended.push(m)
      existingIds[m.userId] = true
    }
  })
  groupStore.memberMapByGroupId[groupId] = appended
}

export function removeGroupMembersLocal(groupId: string, userIds: string[]): void {
  const existing = groupStore.memberMapByGroupId[groupId]
  if (existing == null) return
  const idSet: Record<string, boolean> = {}
  userIds.forEach((id) => {
    idSet[id] = true
  })
  groupStore.memberMapByGroupId[groupId] = existing.filter((m) => !idSet[m.userId])
}

export function updateGroupMemberRole(groupId: string, userId: string, role: GroupMemberRoleValue): void {
  const existing = groupStore.memberMapByGroupId[groupId]
  if (existing == null) return
  const target = existing.find((m) => m.userId === userId)
  if (target != null) {
    target.role = role
  }
}

const GROUP_MEMBER_ROLE_WEIGHT: Record<GroupMemberRoleValue, number> = {
  [GROUP_MEMBER_ROLE.OWNER]: 0,
  [GROUP_MEMBER_ROLE.ADMIN]: 1,
  [GROUP_MEMBER_ROLE.MEMBER]: 2
}

// 展示排序：owner > admin > member，同角色按 joinedAt 升序（缺失排末尾）；
// 返回新数组，不改 store 缓存原顺序（分页 append 依赖原顺序）
export function sortGroupMembers(members: EmGroupMember[]): EmGroupMember[] {
  return [...members].sort((a, b) => {
    const diff = GROUP_MEMBER_ROLE_WEIGHT[a.role] - GROUP_MEMBER_ROLE_WEIGHT[b.role]
    if (diff !== 0) return diff
    const at = a.joinedAt > 0 ? a.joinedAt : Number.MAX_SAFE_INTEGER
    const bt = b.joinedAt > 0 ? b.joinedAt : Number.MAX_SAFE_INTEGER
    return at - bt
  })
}

export function setGroupAnnouncement(groupId: string, announcement: string): void {
  groupStore.announcementByGroupId[groupId] = announcement
}

export function clearGroups(): void {
  groupStore.items = []
  groupStore.overrideByGroupId = {}
  groupStore.loaded = false
  groupStore.syncing = false
  groupStore.syncFailed = false
  groupStore.infoByGroupId = {}
  groupStore.memberMapByGroupId = {}
  groupStore.announcementByGroupId = {}
  groupStore.memberCursorByGroupId = {}
  groupStore.memberHasMoreByGroupId = {}
  groupStore.adminSyncedByGroupId = {}
}
