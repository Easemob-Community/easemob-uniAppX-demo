import type {
  ChatClient,
  Contact,
  ContactManager,
  ContactRosterEventPayload,
  UserInfo
} from 'easemob-websdk'
import { CONTACT_INVITE_KIND, CONTACT_INVITE_STATUS } from '../constants'
import {
  addInvite,
  clearContacts,
  contactStore,
  convergeContactInvites,
  removeInviteByFrom,
  updateInviteStatus
} from '../store/contact'
import { mergeUserInfo } from '../store/user'
import { createLogger, logPayload } from '../utils/logger'
import type { EmContactInvite } from '../types'
import { getAccountEpoch, invalidateAccountEpoch, isAccountEpochCurrent } from './account'

const logger = createLogger('contact')

// 好友关系与申请（5.x ContactManager 封装）：
// 后台同步事件给出权威状态；主动重试走 SDK 受控刷新，不以内存空快照冒充成功。
export class EmContact {
  private client: ChatClient | null = null
  private waitOnline: (() => Promise<void>) | null = null
  private syncRequestId = 0

  bind(client: ChatClient, waitOnline: () => Promise<void>): void {
    if (this.client != null) {
      return
    }
    this.client = client
    this.waitOnline = waitOnline
    const syncHandlerEpoch = getAccountEpoch()
    // 好友自动同步由 SDK 后台异步完成，getContacts() 首次可能读到空快照
    // （实测坑：小程序端缓存加载慢于 H5 localStorage，登录后即读必空）——
    // 必须挂 ChatClient 级统一同步事件，contact 同步完成后重读快照自愈
    client.addEventHandler('emkit-contact-sync', {
      onSyncDataStart: (payload) => {
        if (!isAccountEpochCurrent(syncHandlerEpoch) || payload.dataType !== 'contact') return
        this.syncRequestId += 1
        contactStore.syncing = true
        contactStore.syncFailed = false
      },
      onSyncDataFinished: (payload) => {
        logPayload(logger, 'onSyncDataFinished:', payload)
        if (!isAccountEpochCurrent(syncHandlerEpoch) || payload.dataType !== 'contact') return
        this.syncRequestId += 1
        contactStore.syncing = false
        if (payload.status === 'failed') {
          logger.warn('contact sync failed:', payload.error?.stage, payload.error?.message)
          contactStore.syncFailed = true
          return
        }
        logger.info('contact sync finished, refreshing snapshot')
        this.refresh(syncHandlerEpoch, true)
      }
    })
    const mgr = this.manager()
    if (mgr == null) {
      return
    }
    mgr.addEventHandler('emkit-contact', {
      // 收到好友申请（被邀请方）：落一条 pending 申请
      onContactInvited: (p: ContactRosterEventPayload) => {
        logPayload(logger, 'onContactInvited:', p)
        addInvite({
          id: `${p.from}:${Date.now()}`,
          kind: CONTACT_INVITE_KIND.CONTACT,
          from: p.from,
          message: typeof p.message === 'string' ? p.message : '',
          status: CONTACT_INVITE_STATUS.PENDING,
          outgoing: false,
          ts: Date.now()
        })
        this.mergeProfile(p.from, p.userInfo)
      },
      // 好友关系建立（双方收）：刷新快照；全部匹配且收到的 pending 好友申请置 accepted 并持久化
      onContactAdded: (p: ContactRosterEventPayload) => {
        logPayload(logger, 'onContactAdded:', p)
        this.refresh()
        const pending = contactStore.invites.filter((i) => i.kind === CONTACT_INVITE_KIND.CONTACT && i.from === p.from && !i.outgoing && i.status === CONTACT_INVITE_STATUS.PENDING)
        pending.forEach((invite) => {
          updateInviteStatus(invite.id, CONTACT_INVITE_STATUS.ACCEPTED)
        })
        this.mergeProfile(p.from, p.userInfo)
      },
      // 被对方删除：刷新快照并清掉与其相关的 contact kind 申请记录（群邀请与好友关系无关，保留）
      onContactDeleted: (p: ContactRosterEventPayload) => {
        logPayload(logger, 'onContactDeleted:', p)
        this.refresh()
        removeInviteByFrom(p.from)
      },
      // 我方申请被接受（发起方收）：刷新快照；若本地有其 pending 好友申请则置 accepted
      //（kind 过滤必须：同一用户的 pending 群邀请不能被好友事件误置）
      onContactAgreed: (p: ContactRosterEventPayload) => {
        logPayload(logger, 'onContactAgreed:', p)
        this.refresh()
        const pending = contactStore.invites.find((i) => i.kind === CONTACT_INVITE_KIND.CONTACT && i.from === p.from && i.status === CONTACT_INVITE_STATUS.PENDING)
        if (pending != null) {
          updateInviteStatus(pending.id, CONTACT_INVITE_STATUS.ACCEPTED)
        }
      },
      // 我方申请被拒绝（发起方收）：落一条 outgoing 已拒绝通知
      onContactRefuse: (p: ContactRosterEventPayload) => {
        logPayload(logger, 'onContactRefuse:', p)
        addInvite({
          id: `${p.from}:${Date.now()}`,
          kind: CONTACT_INVITE_KIND.CONTACT,
          from: p.from,
          message: typeof p.message === 'string' ? p.message : '',
          status: CONTACT_INVITE_STATUS.DECLINED,
          outgoing: true,
          ts: Date.now()
        })
      },
      // 好友资料/备注变更（含跨端备注同步）：刷新快照 + 用户资料缓存
      onContactInfoUpdated: (payload) => {
        logPayload(logger, 'onContactInfoUpdated:', payload)
        this.mergeProfile(payload.userInfo.userId, payload.userInfo)
        this.refresh()
      }
    })
  }

  unbind(): void {
    if (this.client != null) {
      this.client.removeEventHandler('emkit-contact-sync')
      this.manager()?.removeEventHandler('emkit-contact')
    }
    this.client = null
    this.waitOnline = null
  }

  async syncContacts(expectedEpoch = getAccountEpoch()): Promise<void> {
    const requestId = this.syncRequestId + 1
    this.syncRequestId = requestId
    if (!isAccountEpochCurrent(expectedEpoch)) return
    contactStore.syncing = true
    contactStore.syncFailed = false
    const isCurrent = (): boolean => isAccountEpochCurrent(expectedEpoch) && requestId === this.syncRequestId
    try {
      await this.readyContactManager()
      if (!isCurrent()) return
      const client = this.client as unknown as { refreshContactSnapshot?: () => Promise<void> } | null
      if (client == null || typeof client.refreshContactSnapshot !== 'function') {
        throw new Error('contact sync restart unavailable; reconnect or login again')
      }
      await client.refreshContactSnapshot()
      if (!isCurrent()) return
      this.refresh(expectedEpoch, true)
    } catch (e) {
      if (isCurrent()) contactStore.syncFailed = true
      throw e
    } finally {
      if (isCurrent()) contactStore.syncing = false
    }
  }

  async addContact(userId: string, message = ''): Promise<void> {
    const mgr = await this.readyContactManager()
    await mgr.addContact({ userId, message })
  }

  async deleteContact(userId: string): Promise<void> {
    const mgr = await this.readyContactManager()
    await mgr.deleteContact({ userId })
    this.refresh()
  }

  async setContactRemark(userId: string, remark: string): Promise<void> {
    const mgr = await this.readyContactManager()
    await mgr.setContactRemark({ userId, remark })
    this.refresh()
  }

  async acceptContactInvite(invite: EmContactInvite): Promise<void> {
    const mgr = await this.readyContactManager()
    await mgr.acceptContactInvite({ userId: invite.from })
    updateInviteStatus(invite.id, CONTACT_INVITE_STATUS.ACCEPTED)
    this.refresh()
  }

  async declineContactInvite(invite: EmContactInvite): Promise<void> {
    const mgr = await this.readyContactManager()
    await mgr.declineContactInvite({ userId: invite.from })
    updateInviteStatus(invite.id, CONTACT_INVITE_STATUS.DECLINED)
  }

  reset(): void {
    this.syncRequestId += 1
    invalidateAccountEpoch()
    clearContacts()
  }

  private refresh(expectedEpoch = getAccountEpoch(), authoritative = false): void {
    if (!isAccountEpochCurrent(expectedEpoch)) return
    const mgr = this.manager()
    if (mgr == null) {
      return
    }
    const raw = mgr.getContacts()
    if (!isAccountEpochCurrent(expectedEpoch)) return
    logPayload(logger, 'getContacts:', raw)
    logger.info('contact snapshot refreshed, count:', raw.length)
    const items = raw.map((c) => this.toContactItem(c))
    if (!isAccountEpochCurrent(expectedEpoch)) return
    contactStore.items = items
    convergeContactInvites()
    if (authoritative) {
      contactStore.loaded = true
      contactStore.syncFailed = false
    }
  }

  // SDK wire 边界：Contact.userInfo 的 nickname/avatarUrl 归一（兼容 4.x 小写 avatarurl 遗风），
  // 同时并入 userStore 复用现有资料缓存体系
  private toContactItem(c: Contact) {
    const userId = c.userId
    const remark = typeof c.remark === 'string' ? c.remark : ''
    const info = this.normalizeUserInfo(userId, c.userInfo)
    mergeUserInfo(info)
    return {
      userId,
      remark,
      nickname: info.nickname,
      avatarUrl: info.avatarUrl,
      addTs: typeof c.addTs === 'number' ? c.addTs : 0
    }
  }

  private normalizeUserInfo(userId: string, u: UserInfo | undefined) {
    const raw = u as unknown as Record<string, unknown> | undefined
    const nickname = raw != null && typeof raw['nickname'] === 'string' ? raw['nickname'] as string : ''
    let avatarUrl = ''
    if (raw != null) {
      if (typeof raw['avatarUrl'] === 'string') {
        avatarUrl = raw['avatarUrl'] as string
      } else if (typeof raw['avatarurl'] === 'string') {
        avatarUrl = raw['avatarurl'] as string
      }
    }
    return { userId, nickname, avatarUrl }
  }

  private mergeProfile(userId: string, u: UserInfo | undefined): void {
    if (userId === '') return
    mergeUserInfo(this.normalizeUserInfo(userId, u))
  }

  private manager(): ContactManager | null {
    const c = this.client as unknown as { contactManager?: ContactManager } | null
    return c?.contactManager ?? null
  }

  private async readyContactManager(): Promise<ContactManager> {
    if (this.client == null) {
      throw new Error('call EmKit.init() first')
    }
    if (this.waitOnline != null) {
      await this.waitOnline()
    }
    const mgr = this.manager()
    if (mgr == null) {
      throw new Error('ContactManager not registered')
    }
    return mgr
  }
}
