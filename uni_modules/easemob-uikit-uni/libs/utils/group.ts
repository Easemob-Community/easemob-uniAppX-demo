import { GROUP_MEMBER_ROLE } from '../constants'
import type { GroupMemberRoleValue } from '../constants'
import type { EmGroupMember } from '../types'

export function canRemoveGroupMember(
  actorUserId: string,
  actorRole: GroupMemberRoleValue | null,
  target: EmGroupMember
): boolean {
  if (actorUserId === '' || target.userId === actorUserId) return false
  if (actorRole === GROUP_MEMBER_ROLE.OWNER) {
    return target.role !== GROUP_MEMBER_ROLE.OWNER
  }
  if (actorRole === GROUP_MEMBER_ROLE.ADMIN) {
    return target.role === GROUP_MEMBER_ROLE.MEMBER
  }
  return false
}
