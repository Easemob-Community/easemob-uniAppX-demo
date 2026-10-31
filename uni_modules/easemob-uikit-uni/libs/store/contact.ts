import { computed, reactive } from 'vue'
import { CONTACT_INVITE_KIND, CONTACT_INVITE_STATUS } from '../constants'
import { getStorage, setStorage } from '../platform'
import type { EmContactItem, EmContactInvite } from '../types'
import { displayNameOf } from './user'

// 联系人 store（裸 reactive，零依赖）：list 为好友快照（事件驱动刷新），
// invites 为好友申请/群邀请/通知（内存 + storage 持久化，对齐 draft 存储套路）
const INVITES_STORAGE_KEY = 'emkit.contact.invites'

function loadInvites(): EmContactInvite[] {
  try {
    const raw = getStorage(INVITES_STORAGE_KEY)
    if (raw === '') return []
    const list = JSON.parse(raw) as EmContactInvite[]
    // 旧持久化数据无 kind 字段：兜底 contact（好友语义，结构兼容）
    list.forEach((i) => {
      if (i.kind == null) {
        i.kind = CONTACT_INVITE_KIND.CONTACT
      }
    })
    return list
  } catch (e) {
    return []
  }
}

export const contactStore = reactive({
  items: [] as EmContactItem[],
  invites: loadInvites() as EmContactInvite[],
  loaded: false,
  syncing: false,
  syncFailed: false
})

function persistInvites(): void {
  setStorage(INVITES_STORAGE_KEY, JSON.stringify(contactStore.invites))
}

export function remarkOf(userId: string): string {
  const c = contactStore.items.find((item) => item.userId === userId)
  return c != null ? c.remark : ''
}

// 联系人展示名回落链（对齐 vue 版 contact-display）：remark > userStore nickname > userId
export function contactDisplayNameOf(userId: string): string {
  const remark = remarkOf(userId)
  if (remark !== '') return remark
  return displayNameOf(userId)
}

export function isPendingContactInviteForFriend(invite: EmContactInvite): boolean {
  return invite.kind === CONTACT_INVITE_KIND.CONTACT
    && !invite.outgoing
    && invite.status === CONTACT_INVITE_STATUS.PENDING
    && contactStore.items.some((item) => item.userId === invite.from)
}

// 好友快照是申请终态的兜底权威：漏事件或旧持久化 pending 均在快照加载后收敛。
export function convergeContactInvites(): void {
  let changed = false
  contactStore.invites.forEach((invite) => {
    if (isPendingContactInviteForFriend(invite)) {
      invite.status = CONTACT_INVITE_STATUS.ACCEPTED
      changed = true
    }
  })
  if (changed) persistInvites()
}

// 待处理申请数（新请求入口红点）
export function pendingInviteCount(): number {
  return contactStore.invites.filter((i) => !i.outgoing && i.status === CONTACT_INVITE_STATUS.PENDING && !isPendingContactInviteForFriend(i)).length
}

/**
 * 联系人请求未读数（响应式，tabbar/入口角标数据源）。
 * 口径：收到的、仍 pending 的好友申请/群邀请；我方发出后被处理的通知不计。
 * pendingInviteCount() 保留为同步快照函数，两者同一口径。
 */
export const contactRequestUnreadCount = computed(() => pendingInviteCount())

// 新增/合并申请：同 id 覆盖（防事件重放重复），否则置顶插入；回写落 reactive 代理
export function addInvite(invite: EmContactInvite): void {
  const index = contactStore.invites.findIndex((i) => i.id === invite.id)
  if (index >= 0) {
    const target = contactStore.invites[index]
    target.kind = invite.kind
    target.message = invite.message
    target.status = invite.status
    target.outgoing = invite.outgoing
    target.ts = invite.ts
    target.groupId = invite.groupId
    target.groupName = invite.groupName
  } else {
    contactStore.invites.unshift(invite)
  }
  persistInvites()
}

export function updateInviteStatus(id: string, status: EmContactInvite['status']): void {
  const target = contactStore.invites.find((i) => i.id === id)
  if (target != null && target.status !== status) {
    target.status = status
    persistInvites()
  }
}

// 好友被删时清理其好友申请记录（group kind 群邀请与好友关系无关，保留）
export function removeInviteByFrom(from: string): void {
  const next = contactStore.invites.filter((i) => i.from !== from || i.kind === CONTACT_INVITE_KIND.GROUP)
  if (next.length !== contactStore.invites.length) {
    contactStore.invites = next
    persistInvites()
  }
}

export function clearContacts(): void {
  contactStore.items = []
  contactStore.invites = []
  contactStore.loaded = false
  contactStore.syncing = false
  contactStore.syncFailed = false
  persistInvites()
}
