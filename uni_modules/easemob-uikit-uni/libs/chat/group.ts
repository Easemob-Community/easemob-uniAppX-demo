// 群数据域：已加入群快照、群详情、成员游标分页（首屏后补拉 admin 合并角色）、公告，
// 以及群管理写操作（创建/邀请/退群/解散/转让/资料/公告/成员/管理员/全员禁言）。
// 事件接线对齐 vue 版 group-events.ts 语义裁剪（成员进出计数、资料/公告变更、
// 被移出/解散清会话、邀请按 group kind 转 contact invites（含 groupId/群名快照）、群主/管理员/全员禁言角色同步、
// 成员进出/群名变更/公告变更/转让群主插本地系统通知灰条——insertGroupNotice 经 hooks 落消息列表）。
// SDK wire 字段归一（ownerId/owner.userId、maxMembers、joinApprovalRequired、
// muteAllMembers、avatarUrl/avatarurl）集中在 toEmGroup/toEmGroupMember 边界。
import type {
  ChatClient,
  GroupDetail,
  GroupManager,
  GroupMemberEntry,
  GroupSummary,
  GroupUserInfo,
  JoinedGroupSummary,
  UserInfo
} from 'easemob-websdk'
import { CONTACT_INVITE_KIND, CONTACT_INVITE_STATUS, GROUP_MEMBER_PAGE_SIZE, GROUP_MEMBER_ROLE, GROUP_NOTICE_EVENT } from '../constants'
import type { GroupNoticeEventValue } from '../constants'
import { connectionStore } from '../store/connection'
import { addInvite, updateInviteStatus } from '../store/contact'
import { displayNameOf, mergeUserInfo } from '../store/user'
import {
  appendGroupMembers,
  clearGroups,
  groupStore,
  incrementMemberCount,
  removeGroup,
  removeGroupMembersLocal,
  setGroupAnnouncement,
  setGroupMembers,
  setJoinedGroups,
  updateGroup,
  updateGroupMemberRole,
  upsertGroup
} from '../store/group'
import { createLogger, logPayload } from '../utils/logger'
import { useLocale } from '../use/useLocale'
import type { CreateGroupParams, EmContactInvite, EmGroup, EmGroupMember, EmGroupMemberListResult } from '../types'
import { ensureUserInfos } from './user-info'
import { getAccountEpoch, invalidateAccountEpoch, isAccountEpochCurrent, throwIfAccountChanged } from './account'

const logger = createLogger('group')

/** 通知展示名的最小结构（SDK UserInfo/GroupUserInfo 双兼容） */
interface NoticeUser {
  userId: string
  nickname?: string
}

/** 门面注入的群域钩子：被移出/群解散时清会话与本地消息（会话域本地删除入口）；
 * 群名变更时同步会话名（会话列表/聊天头部展示 conversation.name）；
 * 群事件系统通知插入群消息列表（本地灰条，不发服务端） */
export interface EmGroupHooks {
  removeConversationLocal: (conversationId: string) => void
  updateConversationName: (conversationId: string, name: string) => void
  insertGroupNotice: (groupId: string, text: string) => void
}

export class EmGroupDomain {
  private client: ChatClient | null = null
  private waitOnline: (() => Promise<void>) | null = null
  private hooks: EmGroupHooks | null = null
  // 飞行中 Promise 去重（参照 vue group-domain pendingGroupInfoRequests）；请求序号阻止旧响应覆盖新读取。
  private infoPromiseByGroupId: Record<string, Promise<EmGroup>> = {}
  private infoRequestIdByGroupId: Record<string, number> = {}
  private memberRequestIdByGroupId: Record<string, number> = {}
  private announcementPromiseByGroupId: Record<string, Promise<string>> = {}
  private adminPromiseByGroupId: Record<string, Promise<void>> = {}
  private adminRequestIdByGroupId: Record<string, number> = {}
  private syncRequestId = 0

  bind(client: ChatClient, waitOnline: () => Promise<void>, hooks: EmGroupHooks): void {
    if (this.client != null) {
      return
    }
    this.client = client
    this.waitOnline = waitOnline
    this.hooks = hooks
    const syncHandlerEpoch = getAccountEpoch()
    // 群自动同步由 SDK 后台完成（enableSyncData 'group'），同步完成后重读快照自愈（同 contact 套路）
    client.addEventHandler('emkit-group-sync', {
      onSyncDataStart: (payload) => {
        if (!isAccountEpochCurrent(syncHandlerEpoch) || payload.dataType !== 'group') return
        this.syncRequestId += 1
        groupStore.syncing = true
        groupStore.syncFailed = false
      },
      onSyncDataFinished: (payload) => {
        logPayload(logger, 'onSyncDataFinished:', payload)
        if (!isAccountEpochCurrent(syncHandlerEpoch) || payload.dataType !== 'group') return
        this.syncRequestId += 1
        groupStore.syncing = false
        if (payload.status === 'failed') {
          logger.warn('group sync failed:', payload.error?.stage, payload.error?.message)
          groupStore.syncFailed = true
          return
        }
        logger.info('group sync finished, refreshing snapshot')
        this.refresh(syncHandlerEpoch, true)
      }
    })
    const mgr = this.manager()
    if (mgr == null) {
      return
    }
    mgr.addEventHandler('emkit-group', {
      // 成员入群：计数 +n；含己方时确保群在列表内（邀请自动入群等场景）；插系统通知灰条
      onMembersJoined: (payload) => {
        logPayload(logger, 'onMembersJoined:', payload)
        const members = payload.members ?? []
        if (members.some((m) => m.userId === connectionStore.userId)) {
          this.getGroupInfo(payload.groupId).catch(() => {})
        }
        incrementMemberCount(payload.groupId, members.length)
        this.insertGroupNotice(payload.groupId, GROUP_NOTICE_EVENT.MEMBERS_JOINED, { members })
      },
      // 成员退群：计数 -n；插系统通知灰条
      onMembersExited: (payload) => {
        logPayload(logger, 'onMembersExited:', payload)
        const members = payload.members ?? []
        incrementMemberCount(payload.groupId, -members.length)
        this.insertGroupNotice(payload.groupId, GROUP_NOTICE_EVENT.MEMBERS_EXITED, { members })
      },
      // 群资料变更：写详情缓存；名称变化同步会话名（会话列表/聊天头部展示 conversation.name）+ 插系统通知
      onGroupInfoChanged: (payload) => {
        logPayload(logger, 'onGroupInfoChanged:', payload)
        const prev = groupStore.infoByGroupId[payload.groupId]
        const group = this.toEmGroup(payload.groupInfo)
        upsertGroup(group)
        if (group.name !== '' && prev != null && group.name !== prev.name) {
          this.insertGroupNotice(payload.groupId, GROUP_NOTICE_EVENT.GROUP_NAME_CHANGED, { name: group.name })
        }
        this.hooks?.updateConversationName?.(payload.groupId, group.name)
      },
      // 公告变更：写缓存（空串 = 已拉无公告）+ 插系统通知
      onAnnouncementChanged: (payload) => {
        logPayload(logger, 'onAnnouncementChanged:', payload)
        setGroupAnnouncement(payload.groupId, payload.announcement ?? '')
        this.insertGroupNotice(payload.groupId, GROUP_NOTICE_EVENT.ANNOUNCEMENT_CHANGED)
      },
      // 己方被移出群（SDK 5.x 该事件只下发给被移出的当前用户）：清群缓存 + 删会话清消息
      // （不插系统通知：removeConversationLocal 随即清消息缓存，插入即被擦除）
      onUserRemoved: (payload) => {
        logPayload(logger, 'onUserRemoved:', payload)
        removeGroup(payload.groupId)
        this.hooks?.removeConversationLocal(payload.groupId)
      },
      // 群解散：同上
      onGroupDestroyed: (payload) => {
        logPayload(logger, 'onGroupDestroyed:', payload)
        removeGroup(payload.groupId)
        this.hooks?.removeConversationLocal(payload.groupId)
      },
      // 收到群邀请（被邀请方）：转 contact invites 记录（group kind，pending）
      onInvitationReceived: (payload) => {
        logPayload(logger, 'onInvitationReceived:', payload)
        addInvite({
          id: `group:${payload.groupId}:${Date.now()}`,
          kind: CONTACT_INVITE_KIND.GROUP,
          from: payload.inviter?.userId ?? '',
          message: typeof payload.reason === 'string' ? payload.reason : '',
          status: CONTACT_INVITE_STATUS.PENDING,
          outgoing: false,
          ts: Date.now(),
          groupId: payload.groupId,
          groupName: this.groupNameOf(payload.groupId, payload.groupName)
        })
        this.mergeInviterProfile(payload.inviter)
      },
      // 我方邀请被接受（邀请方收）：落 outgoing 通知
      onInvitationAccepted: (payload) => {
        logPayload(logger, 'onInvitationAccepted:', payload)
        addInvite({
          id: `group:${payload.groupId}:${Date.now()}`,
          kind: CONTACT_INVITE_KIND.GROUP,
          from: payload.invitee?.userId ?? '',
          message: typeof payload.reason === 'string' ? payload.reason : '',
          status: CONTACT_INVITE_STATUS.ACCEPTED,
          outgoing: true,
          ts: Date.now(),
          groupId: payload.groupId,
          groupName: this.groupNameOf(payload.groupId)
        })
        this.mergeInviterProfile(payload.invitee)
      },
      // 我方邀请被拒绝（邀请方收）：落 outgoing 通知
      onInvitationDeclined: (payload) => {
        logPayload(logger, 'onInvitationDeclined:', payload)
        addInvite({
          id: `group:${payload.groupId}:${Date.now()}`,
          kind: CONTACT_INVITE_KIND.GROUP,
          from: payload.invitee?.userId ?? '',
          message: typeof payload.reason === 'string' ? payload.reason : '',
          status: CONTACT_INVITE_STATUS.DECLINED,
          outgoing: true,
          ts: Date.now(),
          groupId: payload.groupId,
          groupName: this.groupNameOf(payload.groupId)
        })
        this.mergeInviterProfile(payload.invitee)
      },
      // 邀请被自动接受（无需确认直接入群）：刷新群快照 + 落已接受记录
      onAutoAcceptInvitationFromGroup: (payload) => {
        logPayload(logger, 'onAutoAcceptInvitationFromGroup:', payload)
        this.refresh()
        addInvite({
          id: `group:${payload.groupId}:${Date.now()}`,
          kind: CONTACT_INVITE_KIND.GROUP,
          from: payload.inviter?.userId ?? '',
          message: typeof payload.inviteMessage === 'string' ? payload.inviteMessage : '',
          status: CONTACT_INVITE_STATUS.ACCEPTED,
          outgoing: false,
          ts: Date.now(),
          groupId: payload.groupId,
          groupName: this.groupNameOf(payload.groupId)
        })
        this.mergeInviterProfile(payload.inviter)
      },
      // 群主变更：owner 为成员角色唯一权威，新旧群主角色同步修正；插系统通知灰条
      onOwnerChanged: (payload) => {
        logPayload(logger, 'onOwnerChanged:', payload)
        const prevOwner = groupStore.infoByGroupId[payload.groupId]?.owner ?? payload.oldOwner?.userId ?? ''
        const newOwner = payload.newOwner?.userId ?? ''
        if (newOwner !== '') {
          updateGroup(payload.groupId, { owner: newOwner })
          updateGroupMemberRole(payload.groupId, newOwner, GROUP_MEMBER_ROLE.OWNER)
        }
        if (prevOwner !== '' && prevOwner !== newOwner) {
          updateGroupMemberRole(payload.groupId, prevOwner, GROUP_MEMBER_ROLE.MEMBER)
        }
        this.insertGroupNotice(payload.groupId, GROUP_NOTICE_EVENT.OWNER_CHANGED, { name: this.noticeNameOf(payload.newOwner) })
      },
      onAdminAdded: (payload) => {
        logPayload(logger, 'onAdminAdded:', payload)
        const userId = payload.administrator?.userId
        if (userId != null && userId !== '') {
          updateGroupMemberRole(payload.groupId, userId, GROUP_MEMBER_ROLE.ADMIN)
        }
      },
      onAdminRemoved: (payload) => {
        logPayload(logger, 'onAdminRemoved:', payload)
        const userId = payload.administrator?.userId
        if (userId != null && userId !== '') {
          updateGroupMemberRole(payload.groupId, userId, GROUP_MEMBER_ROLE.MEMBER)
        }
      },
      onAllMemberMuteStateChanged: (payload) => {
        logPayload(logger, 'onAllMemberMuteStateChanged:', payload)
        updateGroup(payload.groupId, { mute: payload.isMuted })
      }
    })
  }

  unbind(): void {
    if (this.client != null) {
      this.client.removeEventHandler('emkit-group-sync')
      this.manager()?.removeEventHandler('emkit-group')
    }
    this.client = null
    this.waitOnline = null
    this.hooks = null
  }

  // SDK 没有已加入群全量手动重启同步 API；失败后重读缓存仍明确拒绝，不伪造权威成功。
  async getJoinedGroups(expectedEpoch = getAccountEpoch()): Promise<EmGroup[]> {
    const requestId = this.syncRequestId + 1
    this.syncRequestId = requestId
    throwIfAccountChanged(expectedEpoch)
    const wasFailed = groupStore.syncFailed
    groupStore.syncing = true
    groupStore.syncFailed = false
    const isCurrent = (): boolean => isAccountEpochCurrent(expectedEpoch) && requestId === this.syncRequestId
    try {
      await this.readyGroupManager()
      throwIfAccountChanged(expectedEpoch)
      if (!isCurrent()) return groupStore.items
      this.refresh(expectedEpoch, false)
      if (wasFailed) {
        throw new Error('joined-group sync restart unavailable; reconnect or login again')
      }
      return groupStore.items
    } catch (e) {
      if (isCurrent()) groupStore.syncFailed = true
      throw e
    } finally {
      if (isCurrent()) groupStore.syncing = false
    }
  }

  // 单群详情：普通调用飞行中去重；force 用于移除后的权威重读，旧请求不得覆盖新请求或清理其 pending。
  async getGroupInfo(groupId: string, force = false, expectedEpoch = getAccountEpoch()): Promise<EmGroup> {
    throwIfAccountChanged(expectedEpoch)
    const existing = this.infoPromiseByGroupId[groupId]
    if (existing != null && !force) {
      return existing
    }
    const requestId = (this.infoRequestIdByGroupId[groupId] ?? 0) + 1
    this.infoRequestIdByGroupId[groupId] = requestId
    const promise = (async () => {
      const mgr = await this.readyGroupManager()
      throwIfAccountChanged(expectedEpoch)
      const detail = await mgr.getGroupInfo({ groupId })
      throwIfAccountChanged(expectedEpoch)
      const group = this.toEmGroup(detail)
      if (requestId === this.infoRequestIdByGroupId[groupId] && isAccountEpochCurrent(expectedEpoch)) {
        upsertGroup(group)
      }
      return group
    })()
    this.infoPromiseByGroupId[groupId] = promise
    try {
      return await promise
    } finally {
      if (this.infoPromiseByGroupId[groupId] === promise) {
        delete this.infoPromiseByGroupId[groupId]
      }
    }
  }

  // 成员游标分页：首页整量回写 + 补拉 admin 合并角色；仅最新请求可写成员/游标，防旧预拉重加已移除成员。
  // applied 向所有调用方报告响应归属：当前成功且实际写入=true；陈旧成功 resolve=false；
  // 陈旧失败 reject 结构化结果（applied=false），当前真实失败保留原始 error/rejection。
  async getGroupMemberList(groupId: string, cursor?: string, pageSize = GROUP_MEMBER_PAGE_SIZE, expectedEpoch = getAccountEpoch()): Promise<EmGroupMemberListResult> {
    throwIfAccountChanged(expectedEpoch)
    const requestId = (this.memberRequestIdByGroupId[groupId] ?? 0) + 1
    this.memberRequestIdByGroupId[groupId] = requestId
    try {
      const mgr = await this.readyGroupManager()
      throwIfAccountChanged(expectedEpoch)
      const page = await mgr.getGroupMemberList({ groupId, cursor, pageSize })
      throwIfAccountChanged(expectedEpoch)
      const members = page.items.map((e) => this.toEmGroupMember(e))
      const result = { items: members, cursor: page.cursor ?? '', hasMore: page.hasMore ?? false, applied: false }
      if (requestId !== this.memberRequestIdByGroupId[groupId] || !isAccountEpochCurrent(expectedEpoch)) {
        return result
      }
      if (cursor == null || cursor === '') {
        setGroupMembers(groupId, members)
        // 首屏后补拉管理员合并角色；失败不阻塞成员列表展示
        this.syncGroupAdmins(groupId, expectedEpoch).catch(() => {})
      } else {
        appendGroupMembers(groupId, members)
      }
      groupStore.memberCursorByGroupId[groupId] = result.cursor
      groupStore.memberHasMoreByGroupId[groupId] = result.hasMore
      ensureUserInfos(members.map((m) => m.userId))
      return { ...result, applied: true }
    } catch (e) {
      if (requestId !== this.memberRequestIdByGroupId[groupId] || !isAccountEpochCurrent(expectedEpoch)) {
        throw { items: [], cursor: '', hasMore: false, applied: false } as EmGroupMemberListResult
      }
      throw e
    }
  }

  // 群公告：飞行中去重；undefined=未拉取、空串=已拉无公告
  async getGroupAnnouncement(groupId: string, expectedEpoch = getAccountEpoch()): Promise<string> {
    throwIfAccountChanged(expectedEpoch)
    const cached = groupStore.announcementByGroupId[groupId]
    if (cached !== undefined) {
      return cached
    }
    const existing = this.announcementPromiseByGroupId[groupId]
    if (existing != null) {
      return existing
    }
    const promise = (async () => {
      const mgr = await this.readyGroupManager()
      throwIfAccountChanged(expectedEpoch)
      const result = await mgr.getGroupAnnouncement({ groupId })
      throwIfAccountChanged(expectedEpoch)
      const announcement = result.announcement ?? ''
      setGroupAnnouncement(groupId, announcement)
      return announcement
    })()
    this.announcementPromiseByGroupId[groupId] = promise
    try {
      return await promise
    } finally {
      if (this.announcementPromiseByGroupId[groupId] === promise) {
        delete this.announcementPromiseByGroupId[groupId]
      }
    }
  }

  // 创建群：创建者即群主，立即写本地缓存（权限判定不依赖后续同步）；
  // 随后 best-effort 拉权威详情校准（对齐 vue group-domain.createGroup）
  async createGroup(params: CreateGroupParams): Promise<string> {
    const mgr = await this.readyGroupManager()
    const result = await mgr.createGroup({
      name: params.name,
      description: params.description ?? '',
      memberIds: params.members,
      public: params.public ?? false,
      joinApprovalRequired: params.approval ?? false,
      allowInvites: params.allowInvites ?? false,
      inviteNeedConfirm: params.inviteNeedConfirm ?? false,
      maxMembers: params.maxMembers
    })
    upsertGroup({
      groupId: result.groupId,
      name: params.name,
      description: params.description ?? '',
      owner: connectionStore.userId,
      memberCount: (params.members?.length ?? 0) + 1,
      maxUsers: params.maxMembers ?? 0,
      public: params.public ?? false,
      approval: params.approval ?? false,
      allowInvites: params.allowInvites ?? false,
      inviteNeedConfirm: params.inviteNeedConfirm ?? false,
      mute: false,
      disabled: false
    }, true)
    this.getGroupInfo(result.groupId).catch(() => {})
    return result.groupId
  }

  async inviteUsersToGroup(groupId: string, userIds: string[]): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.inviteUsersToGroup({ groupId, userIds })
  }

  // 接受成功与后续快照恢复分离：群同步不可用不能把已接受申请翻成失败。
  async acceptGroupInvite(invite: EmContactInvite): Promise<void> {
    if (invite.groupId == null || invite.groupId === '') {
      throw new Error('group invite missing groupId')
    }
    const mgr = await this.readyGroupManager()
    await mgr.acceptInvitation({ groupId: invite.groupId })
    updateInviteStatus(invite.id, CONTACT_INVITE_STATUS.ACCEPTED)
    this.getJoinedGroups().catch(() => {})
  }

  // 拒绝群邀请：SDK rejectInvitation → 置 declined
  async declineGroupInvite(invite: EmContactInvite): Promise<void> {
    if (invite.groupId == null || invite.groupId === '') {
      throw new Error('group invite missing groupId')
    }
    const mgr = await this.readyGroupManager()
    await mgr.rejectInvitation({ groupId: invite.groupId })
    updateInviteStatus(invite.id, CONTACT_INVITE_STATUS.DECLINED)
  }

  async leaveGroup(groupId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.leaveGroup({ groupId })
    removeGroup(groupId)
  }

  async destroyGroup(groupId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.destroyGroup({ groupId })
    removeGroup(groupId)
  }

  async changeGroupOwner(groupId: string, userId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.changeGroupOwner({ groupId, newOwner: userId })
    const prevOwner = groupStore.infoByGroupId[groupId]?.owner ?? ''
    updateGroup(groupId, { owner: userId })
    updateGroupMemberRole(groupId, userId, GROUP_MEMBER_ROLE.OWNER)
    if (prevOwner !== '' && prevOwner !== userId) {
      updateGroupMemberRole(groupId, prevOwner, GROUP_MEMBER_ROLE.MEMBER)
    }
  }

  async updateGroupInfo(groupId: string, partial: { name?: string, description?: string, avatar?: string }): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.getGroup(groupId).updateInfo({
      name: partial.name,
      description: partial.description,
      avatar: partial.avatar
    })
    updateGroup(groupId, {
      name: partial.name,
      description: partial.description,
      avatar: partial.avatar
    })
  }

  async updateGroupAnnouncement(groupId: string, content: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.updateGroupAnnouncement({ groupId, announcement: content })
    setGroupAnnouncement(groupId, content)
  }

  async removeGroupMembers(groupId: string, userIds: string[]): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.removeGroupMembers({ groupId, userIds })
    // 移除成功后旧管理员快照即失效；允许移除后的成员首屏重新同步，旧响应不得重加成员。
    this.adminRequestIdByGroupId[groupId] = (this.adminRequestIdByGroupId[groupId] ?? 0) + 1
    delete this.adminPromiseByGroupId[groupId]
    groupStore.adminSyncedByGroupId[groupId] = false
    removeGroupMembersLocal(groupId, userIds)
  }

  async addGroupAdmin(groupId: string, userId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.addGroupAdmin({ groupId, userId })
    updateGroupMemberRole(groupId, userId, GROUP_MEMBER_ROLE.ADMIN)
  }

  async removeGroupAdmin(groupId: string, userId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.removeGroupAdmin({ groupId, userId })
    updateGroupMemberRole(groupId, userId, GROUP_MEMBER_ROLE.MEMBER)
  }

  async muteAllGroupMembers(groupId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.getGroup(groupId).muteAllMembers()
    updateGroup(groupId, { mute: true })
  }

  async unmuteAllGroupMembers(groupId: string): Promise<void> {
    const mgr = await this.readyGroupManager()
    await mgr.getGroup(groupId).unmuteAllMembers()
    updateGroup(groupId, { mute: false })
  }

  reset(): void {
    this.syncRequestId += 1
    invalidateAccountEpoch()
    this.infoPromiseByGroupId = {}
    this.infoRequestIdByGroupId = {}
    this.memberRequestIdByGroupId = {}
    this.announcementPromiseByGroupId = {}
    this.adminPromiseByGroupId = {}
    this.adminRequestIdByGroupId = {}
    clearGroups()
  }

  // 拉取并合并群管理员到成员缓存；普通首屏复用在途请求，只有最新一代可写角色/成员并清理自身 pending。
  private async syncGroupAdmins(groupId: string, expectedEpoch = getAccountEpoch()): Promise<void> {
    throwIfAccountChanged(expectedEpoch)
    if (groupStore.adminSyncedByGroupId[groupId]) {
      return
    }
    const existing = this.adminPromiseByGroupId[groupId]
    if (existing != null) {
      return existing
    }
    const requestId = (this.adminRequestIdByGroupId[groupId] ?? 0) + 1
    this.adminRequestIdByGroupId[groupId] = requestId
    const promise = (async () => {
      const mgr = await this.readyGroupManager()
      if (!isAccountEpochCurrent(expectedEpoch)) return
      const admins = await mgr.getGroup(groupId).getAdmins()
      if (requestId !== this.adminRequestIdByGroupId[groupId] || !isAccountEpochCurrent(expectedEpoch)) {
        return
      }
      const adminMembers = (admins ?? []).map((u) => this.toGroupMemberFromUser(u, GROUP_MEMBER_ROLE.ADMIN))
      appendGroupMembers(groupId, adminMembers)
      adminMembers.forEach((a) => updateGroupMemberRole(groupId, a.userId, GROUP_MEMBER_ROLE.ADMIN))
      groupStore.adminSyncedByGroupId[groupId] = true
    })()
    this.adminPromiseByGroupId[groupId] = promise
    try {
      return await promise
    } finally {
      if (this.adminPromiseByGroupId[groupId] === promise) {
        delete this.adminPromiseByGroupId[groupId]
      }
    }
  }

  private refresh(expectedEpoch = getAccountEpoch(), authoritative = false): void {
    if (!isAccountEpochCurrent(expectedEpoch)) return
    const mgr = this.manager()
    if (mgr == null) {
      return
    }
    const raw = mgr.getJoinedGroupList()
    if (!isAccountEpochCurrent(expectedEpoch)) return
    logPayload(logger, 'getJoinedGroupList:', raw)
    logger.info('joined group snapshot refreshed, count:', raw.length)
    setJoinedGroups(raw.map((g) => this.toEmGroup(g)), authoritative)
    if (authoritative) groupStore.syncFailed = false
  }

  // 群事件系统通知（M2.9 Phase 5b）：本地插入群消息列表灰条（不落服务端），
  // 消费点对齐 vue group-events 语义裁剪——成员进出/群名变更/公告变更/转让群主有文案；
  // 管理员变更/全员禁言/被移出/解散不插（被移出与解散随即清会话清消息，插入即被擦除）。
  private insertGroupNotice(groupId: string, eventKey: GroupNoticeEventValue, opts?: { members?: readonly NoticeUser[], name?: string }): void {
    const { t } = useLocale()
    let text = ''
    if (eventKey === GROUP_NOTICE_EVENT.MEMBERS_JOINED) {
      text = this.memberNoticeText(opts?.members ?? [], 'group.notice.memberJoined', 'group.notice.memberJoinedMultiple')
    } else if (eventKey === GROUP_NOTICE_EVENT.MEMBERS_EXITED) {
      text = this.memberNoticeText(opts?.members ?? [], 'group.notice.memberExited', 'group.notice.memberExitedMultiple')
    } else if (eventKey === GROUP_NOTICE_EVENT.GROUP_NAME_CHANGED) {
      text = t('group.notice.groupNameChanged', { name: opts?.name ?? '' })
    } else if (eventKey === GROUP_NOTICE_EVENT.ANNOUNCEMENT_CHANGED) {
      text = t('group.notice.announcementChanged')
    } else if (eventKey === GROUP_NOTICE_EVENT.OWNER_CHANGED) {
      text = t('group.notice.ownerChanged', { name: opts?.name ?? '' })
    }
    if (text === '') {
      return
    }
    this.hooks?.insertGroupNotice?.(groupId, text)
  }

  // 多成员通知：中文 count 为总人数；英文 “and N others” 使用 othersCount（排除已点名的首位成员）。
  private memberNoticeText(members: readonly NoticeUser[], singleKey: string, multipleKey: string): string {
    if (members.length === 0) {
      return ''
    }
    const { t } = useLocale()
    if (members.length === 1) {
      return t(singleKey, { name: this.noticeNameOf(members[0]) })
    }
    const nonSelf = members.find((m) => m.userId !== connectionStore.userId) ?? members[0]
    const params = {
      name: this.noticeNameOf(nonSelf),
      count: members.length,
      othersCount: members.length - 1
    }
    return members.length === 2 ? t(`${multipleKey}OneOther`, params) : t(multipleKey, params)
  }

  // 通知展示名：自己显示「你」，其余昵称 > userStore 展示名（userId 兜底）
  private noticeNameOf(user: NoticeUser | undefined): string {
    if (user == null || user.userId === '') {
      return ''
    }
    if (user.userId === connectionStore.userId) {
      return useLocale().t('group.notice.you')
    }
    const nick = typeof user.nickname === 'string' ? user.nickname : ''
    return nick !== '' ? nick : displayNameOf(user.userId)
  }

  // SDK wire 边界：JoinedGroupSummary（ownerId）与 GroupDetail（owner.userId）双形态归一；
  // maxMembers→maxUsers、joinApprovalRequired→approval、muteAllMembers→mute
  private toEmGroup(raw: JoinedGroupSummary | GroupDetail): EmGroup {
    const summary = raw as GroupSummary
    const detail = raw as GroupDetail
    const joined = raw as JoinedGroupSummary
    const owner = detail.owner?.userId ?? joined.ownerId ?? ''
    return {
      groupId: summary.groupId,
      name: summary.name !== '' ? summary.name : summary.groupId,
      description: summary.description ?? '',
      owner,
      memberCount: summary.memberCount ?? 0,
      maxUsers: summary.maxMembers ?? 0,
      avatar: (detail.avatarUrl ?? joined.avatarUrl) !== undefined ? (detail.avatarUrl ?? joined.avatarUrl) : undefined,
      public: summary.public ?? false,
      approval: summary.joinApprovalRequired ?? false,
      allowInvites: summary.allowInvites ?? false,
      inviteNeedConfirm: detail.inviteNeedConfirm ?? false,
      mute: detail.muteAllMembers ?? joined.muteAllMembers ?? false,
      disabled: summary.disabled ?? false
    }
  }

  private toEmGroupMember(entry: GroupMemberEntry): EmGroupMember {
    const role = entry.role === 'owner' || entry.role === 'admin' ? entry.role : GROUP_MEMBER_ROLE.MEMBER
    return {
      ...this.toGroupMemberFromUser(entry.user, role),
      joinedAt: entry.joinedAt ?? 0
    }
  }

  private toGroupMemberFromUser(user: GroupUserInfo, role: EmGroupMember['role']): EmGroupMember {
    const raw = user as unknown as Record<string, unknown>
    const avatar = typeof raw['avatarUrl'] === 'string' ? raw['avatarUrl'] as string : (typeof raw['avatarurl'] === 'string' ? raw['avatarurl'] as string : undefined)
    return {
      userId: user.userId,
      role,
      joinedAt: 0,
      nick: typeof user.nickname === 'string' && user.nickname !== '' ? user.nickname : undefined,
      avatar
    }
  }

  // 群邀请群名快照：事件载荷 groupName 优先，缺省读 store 详情缓存（均无则空串，展示走回落链）
  private groupNameOf(groupId: string, payloadName?: string): string {
    if (typeof payloadName === 'string' && payloadName !== '') {
      return payloadName
    }
    return groupStore.infoByGroupId[groupId]?.name ?? ''
  }

  // 邀请人/被邀请人资料并入 userStore（邀请条目展示名复用 displayNameOf 回落链）
  private mergeInviterProfile(u: UserInfo | undefined): void {
    if (u == null || u.userId === '') {
      return
    }
    const raw = u as unknown as Record<string, unknown>
    mergeUserInfo({
      userId: u.userId,
      nickname: typeof u.nickname === 'string' ? u.nickname : '',
      avatarUrl: typeof raw['avatarUrl'] === 'string' ? raw['avatarUrl'] as string : (typeof raw['avatarurl'] === 'string' ? raw['avatarurl'] as string : '')
    })
  }

  private manager(): GroupManager | null {
    const c = this.client as unknown as { groupManager?: GroupManager } | null
    return c?.groupManager ?? null
  }

  private async readyGroupManager(): Promise<GroupManager> {
    if (this.client == null) {
      throw new Error('call EmKit.init() first')
    }
    if (this.waitOnline != null) {
      await this.waitOnline()
    }
    const mgr = this.manager()
    if (mgr == null) {
      throw new Error('GroupManager not registered')
    }
    return mgr
  }
}
