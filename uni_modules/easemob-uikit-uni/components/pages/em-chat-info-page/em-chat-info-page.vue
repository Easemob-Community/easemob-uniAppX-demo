<template>
  <view :class="[ns.b(), themeClass, customClass]" :style="customStyle">
    <!-- primaryColor 内联变量挂内层：蒸汽端同节点 class 变量会顶掉内联变量（坑集 §5k） -->
    <view :class="ns.e('brand-scope')" :style="primaryColorStyle()">
      <!-- 自绘导航栏（pages.json 配 navigationStyle:custom / App titleNView:false），胶囊避让内置于 em-nav-bar -->
      <em-nav-bar :title="title !== '' ? title : t('chat.info.title')" @back="emit('back')" />

      <scroll-view :class="ns.e('scroll')" scroll-y>
        <!-- 单聊分支：对方信息条（对齐 vue 版成员 strip 的单聊形态：48px 头像 + 昵称 + userId） -->
        <view v-if="!isGroupChat" :class="ns.e('profile')">
          <em-avatar :src="avatar" :name="displayName" :size="48" />
          <view :class="ns.e('profile-main')">
            <text :class="ns.e('profile-name')">{{ displayName }}</text>
            <text :class="ns.e('profile-id')">{{ conversationId }}</text>
          </view>
        </view>

        <!-- 群分支：成员宫格 + 群名称 + 群公告字段行（纯展示子组件；编辑弹层在页面根级） -->
        <em-group-info-blocks
          v-else
          :group-id="conversationId"
          :is-owner="isOwner"
          :is-admin="isAdmin"
          :show-member-grid="showMemberGrid"
          :show-group-name="showGroupName"
          :show-announcement="showAnnouncement"
          @invite="onInvite"
          @remove="onRemove"
          @open-members="onOpenMembers"
          @edit-name="nameEditShow = true"
          @show-announcement="announcementShow = true"
        >
          <!-- 群名扩展位透传（标签/业务徽标）：scope 同 em-group-info-blocks 的 #name-extra -->
          <template #name-extra="scope">
            <slot name="group-name-extra" :group-id="scope.groupId" :name="scope.name" :ext="scope.ext" />
          </template>
        </em-group-info-blocks>

        <!-- 设置 cell 组（52px 行高 + 发丝分隔线，对齐 vue 版 EmCell compact） -->
        <view :class="ns.e('group')">
          <view :class="ns.e('cell')">
            <text :class="ns.e('cell-label')">{{ t('chat.info.conversationMute') }}</text>
            <EmSwitch :model-value="muted" :loading="muting" @change="onMuteChange" />
          </view>
          <view :class="[ns.e('cell'), ns.m('cell-last')]">
            <text :class="ns.e('cell-label')">{{ t('chat.info.conversationPin') }}</text>
            <EmSwitch :model-value="pinned" :loading="pinning" @change="onPinChange" />
          </view>
        </view>

        <!-- footer 胶囊按钮（em-button pill+block，对齐 vue 版：42px 高、圆角 999、灰底、15px/500） -->
        <view :class="ns.e('footer')">
          <em-button :text="t('chat.info.clearHistory')" pill block :loading="clearingHistory" :disabled="clearingHistory" :class="ns.e('footer-btn')" @click="onClearHistory" />
          <em-button :text="t('chat.info.deleteConversation')" pill block :loading="deletingConversation" :disabled="exitPending || exitCompleted" :class="ns.e('footer-btn')" @click="onDelete" />
          <!-- 单聊红色区：删除好友（danger = 灰底红字档，与退群/解散同档）；仅对方已是好友时显示 -->
          <em-button
            v-if="!isGroupChat && isContact"
            :text="t('chat.info.deleteFriend')"
            type="danger"
            pill
            block
            :loading="deletingContact"
            :disabled="exitPending || exitCompleted"
            :class="ns.e('footer-btn')"
            @click="onDeleteContact"
          />
          <!-- 群分支红色区：成员「退出群聊」/ owner「解散群聊」（danger = 灰底红字档） -->
          <em-button
            v-if="isGroupChat"
            :text="isOwner ? t('group.destroy') : t('group.leave')"
            type="danger"
            pill
            block
            :loading="leavingGroup"
            :disabled="exitPending || exitCompleted"
            :class="ns.e('footer-btn')"
            @click="onLeaveOrDestroy"
          />
        </view>
      </scroll-view>

      <!-- 群名称/群公告编辑弹层（弹层组件挂页面根级，不进 scroll-view） -->
      <em-group-field-dialog
        v-if="isGroupChat"
        :group-id="conversationId"
        :is-owner="isOwner"
        :is-admin="isAdmin"
        v-model:name-edit-show="nameEditShow"
        v-model:announcement-show="announcementShow"
      />

      <!-- 成员管理视图：页内全屏覆盖层（页内 view 切换，不碰路由），back 回主视图 -->
      <em-group-members-view
        v-if="isGroupChat && membersVisible"
        :group-id="conversationId"
        @back="membersVisible = false"
        @chat-member="emit('chat-member', $event)"
      />

      <!-- 邀请入群弹层（库内闭环）：multiple 选人，disabledIds = 已在群成员；成功 toast + 重拉成员首屏兜底 -->
      <em-select-contact
        v-if="isGroupChat"
        :items="inviteItems"
        :show="inviteVisible"
        :select-mode="SELECT_CONTACT_MODE.MULTIPLE"
        :disabled-ids="memberIds"
        :submitting="inviting"
        :title="t('group.invite')"
        @update:show="inviteVisible = $event"
        @confirm="onInviteConfirm"
      />

      <!-- 移除成员弹层（库内闭环）：候选与提交均按当前角色过滤，提交中锁定选择与关闭 -->
      <em-select-contact
        v-if="isGroupChat"
        :items="removeItems"
        :show="removeVisible"
        :select-mode="SELECT_CONTACT_MODE.MULTIPLE"
        :submitting="removing"
        :title="t('group.memberList.remove')"
        @update:show="removeVisible = $event"
        @confirm="onRemoveConfirm"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EmAvatar from '../../em-avatar/em-avatar.vue'
import EmButton from '../../em-button/em-button.vue'
import EmNavBar from '../../em-nav-bar/em-nav-bar.vue'
import EmGroupInfoBlocks from './em-group-info-blocks.vue'
import EmGroupFieldDialog from './em-group-field-dialog.vue'
import EmGroupMembersView from './em-group-members-view.vue'
import EmSelectContact from '../../em-select-contact/em-select-contact.vue'
import EmSwitch from '../../em-switch/em-switch.vue'
import { EmKit } from '../../../libs'
import { CONVERSATION_TYPE, GROUP_MEMBER_ROLE, SELECT_CONTACT_MODE } from '../../../libs/constants'
import type { ConversationTypeValue, GroupMemberRoleValue } from '../../../libs/constants'
import { conversationStore } from '../../../libs/store/conversation'
import { primaryColorStyle } from '../../../libs/store/config'
import { connectionStore } from '../../../libs/store/connection'
import { groupDisplayNameOf, groupMemberDisplayNameOf, groupStore } from '../../../libs/store/group'
import { contactDisplayNameOf, contactStore } from '../../../libs/store/contact'
import { avatarOf, displayNameOf } from '../../../libs/store/user'
import { canRemoveGroupMember } from '../../../libs/utils/group'
import type { EmSelectContactItem } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useTheme } from '../../../libs/use/useTheme'
import { useLocale } from '../../../libs/use/useLocale'

defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  conversationId: string
  /** 会话类型（M2.9 Phase 2 起必传，breaking）：单聊/群聊分支分流 */
  chatType: ConversationTypeValue
  /** 导航标题覆盖，空串回落 i18n */
  title?: string
  /** 群分支成员宫格显隐（仅群聊生效，伪装预留），默认 true */
  showMemberGrid?: boolean
  /** 群分支群名称字段行显隐（仅群聊生效，伪装预留），默认 true */
  showGroupName?: boolean
  /** 群分支群公告字段行显隐（仅群聊生效，伪装预留），默认 true */
  showAnnouncement?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showMemberGrid: true,
  showGroupName: true,
  showAnnouncement: true,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  // 返回上一页（宿主页面负责 navigateBack，与 em-contact-list-page 同约定）
  (e: 'back'): void
  // 删除会话成功（宿主页面负责 navigateBack 退场）
  (e: 'deleted', conversationId: string): void
  // 退群/解散成功（内部已删会话清消息，宿主负责退场，与 deleted 同处理）
  (e: 'leaved', conversationId: string): void
  // 删除好友成功（不删会话，宿主负责退场，与 deleted 同处理）
  (e: 'contact-deleted', userId: string): void
  // 邀请入群（库内已闭环弹层 + 邀请写操作，事件仅通知宿主）
  (e: 'invite', groupId: string): void
  // 移除成员（库内已闭环选人弹层 + 移除写操作，事件仅通知宿主）
  (e: 'remove-members', groupId: string): void
  // 成员管理视图已打开（库内页内视图切换，事件仅通知宿主）
  (e: 'open-members', groupId: string): void
  // 成员私聊意图（宿主接线发起单聊：addConversation + 跳聊天页）
  (e: 'chat-member', userId: string): void
}>()

const ns = useNamespace('chat-info-page')
const { themeClass } = useTheme()
const { t } = useLocale()

const conv = computed(() => conversationStore.items.find((c) => c.conversationId === props.conversationId) ?? null)
// 会话类型以路由 prop 为准（与会话列表/聊天页同一来源）
const chatType = computed(() => props.chatType)
const isGroupChat = computed(() => props.chatType === CONVERSATION_TYPE.GROUP_CHAT)
const displayName = computed(() =>
  isGroupChat.value
    ? groupDisplayNameOf(props.conversationId)
    : displayNameOf(props.conversationId, conv.value?.name ?? '')
)
const avatar = computed(() => {
  if (isGroupChat.value) {
    return groupStore.infoByGroupId[props.conversationId]?.avatar ?? conv.value?.avatar ?? ''
  }
  const a = avatarOf(props.conversationId)
  return a !== '' ? a : (conv.value?.avatar ?? '')
})

// 开关直接读会话 store；domain 负责乐观回写、串行与失败回滚，页面不保留第二份状态
const muted = computed(() => conv.value?.isMuted ?? false)
const pinned = computed(() => conv.value?.isPinned ?? false)
const muting = ref(false)
const pinning = ref(false)
const clearingHistory = ref(false)
const deletingConversation = ref(false)
const exitPending = ref(false)
const exitCompleted = ref(false)
const deletingContact = ref(false)
const leavingGroup = ref(false)

// 删除好友按钮仅对已是好友的单聊对方显示（好友快照由 SDK 登录后自动同步进 contactStore）
const isContact = computed(() =>
  !isGroupChat.value && contactStore.items.some((c) => c.userId === props.conversationId)
)

// 群字段弹层显隐（编辑/保存逻辑在 em-group-field-dialog 内）
const nameEditShow = ref(false)
const announcementShow = ref(false)

// ========== 成员管理视图（页内 view 切换，不碰路由） ==========
const membersVisible = ref(false)

function onOpenMembers(groupId: string): void {
  membersVisible.value = true
  emit('open-members', groupId)
}

// ========== 邀请入群（库内闭环：em-select-contact multiple + EmKit.inviteUsersToGroup） ==========
const inviteVisible = ref(false)
const inviting = ref(false)

function onInvite(groupId: string): void {
  if (inviting.value) return
  inviteVisible.value = true
  emit('invite', groupId)
}

// 候选联系人：展示名走 remark > nickname > userId 回落链（与 em-group-page 建群弹层同口径）
const inviteItems = computed<EmSelectContactItem[]>(() =>
  contactStore.items.map((c) => ({
    userId: c.userId,
    name: contactDisplayNameOf(c.userId),
    avatar: c.avatarUrl !== '' ? c.avatarUrl : avatarOf(c.userId)
  }))
)

// 已在群成员置灰不可选（选中后入群成功的成员仍允许从已选区移除，见 em-select-contact onToggle）
const memberIds = computed<string[]>(() =>
  (groupStore.memberMapByGroupId[props.conversationId] ?? []).map((m) => m.userId)
)

// 邀请不额外套确认；成功才关窗，失败保留已选，提交中由 submitting 锁定弹层。
async function onInviteConfirm(userIds: string[]): Promise<void> {
  if (inviting.value) return
  inviting.value = true
  try {
    await EmKit.inviteUsersToGroup(props.conversationId, userIds)
    inviteVisible.value = false
    uni.showToast({ title: t('group.inviteSuccess'), icon: 'success' })
    EmKit.getGroupMemberList(props.conversationId).catch(() => {})
  } catch (err) {
    uni.showToast({ title: t('group.inviteFailed'), icon: 'none' })
  } finally {
    inviting.value = false
  }
}

// 当前用户群角色：memberMap 为准，owner 字段兜底（成员首屏未回时 owner 判定仍可用）
const selfRole = computed<GroupMemberRoleValue | null>(() => {
  if (!isGroupChat.value) return null
  const members = groupStore.memberMapByGroupId[props.conversationId] ?? []
  return members.find((m) => m.userId === connectionStore.userId)?.role ?? null
})
const actorRole = computed<GroupMemberRoleValue | null>(() => {
  if (selfRole.value != null) return selfRole.value
  if (isGroupChat.value && connectionStore.userId !== '' && groupStore.infoByGroupId[props.conversationId]?.owner === connectionStore.userId) {
    return GROUP_MEMBER_ROLE.OWNER
  }
  return null
})
const isOwner = computed(() => actorRole.value === GROUP_MEMBER_ROLE.OWNER)
const isAdmin = computed(() => actorRole.value === GROUP_MEMBER_ROLE.ADMIN)

// ========== 移除成员（库内闭环：em-select-contact multiple + EmKit.removeGroupMembers） ==========
const removeVisible = ref(false)
const removing = ref(false)

function onRemove(groupId: string): void {
  if (removing.value) return
  removeVisible.value = true
  emit('remove-members', groupId)
}

// 候选与单成员菜单共用权限判定：owner 可移除 admin/member，admin 仅可移除 member。
const removeItems = computed<EmSelectContactItem[]>(() => {
  const members = groupStore.memberMapByGroupId[props.conversationId] ?? []
  return members
    .filter((m) => canRemoveGroupMember(connectionStore.userId, actorRole.value, m))
    .map((m) => ({
      userId: m.userId,
      name: groupMemberDisplayNameOf(props.conversationId, m.userId),
      avatar: m.avatar ?? avatarOf(m.userId)
    }))
})

// 提交时按最新成员与角色重验并去重；全部失效不发请求。成功刷新权威详情/成员首屏，失败保留选择与弹层。
async function onRemoveConfirm(userIds: string[]): Promise<void> {
  if (removing.value) return
  const members = groupStore.memberMapByGroupId[props.conversationId] ?? []
  const validIds: string[] = []
  const includedByUserId: Record<string, boolean> = {}
  userIds.forEach((userId) => {
    if (includedByUserId[userId]) return
    const target = members.find((m) => m.userId === userId)
    if (target != null && canRemoveGroupMember(connectionStore.userId, actorRole.value, target)) {
      includedByUserId[userId] = true
      validIds.push(userId)
    }
  })
  if (validIds.length === 0) {
    uni.showToast({ title: t('group.memberRemoveInvalid'), icon: 'none' })
    return
  }
  removing.value = true
  try {
    await EmKit.removeGroupMembers(props.conversationId, validIds)
    await Promise.all([
      EmKit.getGroupInfo(props.conversationId, true).catch(() => {}),
      EmKit.getGroupMemberList(props.conversationId).catch(() => {})
    ])
    removeVisible.value = false
    uni.showToast({ title: t('group.memberRemoveSuccess'), icon: 'success' })
  } catch (err) {
    uni.showToast({ title: t('group.memberRemoveFailed'), icon: 'none' })
  } finally {
    removing.value = false
  }
}

onMounted(() => {
  if (!isGroupChat.value) {
    EmKit.ensureUserInfos([props.conversationId])
  } else {
    // 群分支预热：群详情 + 成员首屏（宫格/角色判定用），公告未拉则补拉（对齐 chat-page 预热口径）
    EmKit.enterGroup(props.conversationId).catch(() => {})
    if (groupStore.announcementByGroupId[props.conversationId] === undefined) {
      EmKit.getGroupAnnouncement(props.conversationId).catch(() => {})
    }
  }
})

async function onMuteChange(value: boolean): Promise<void> {
  if (muting.value) return
  muting.value = true
  try {
    await EmKit.setConversationMuted(props.conversationId, chatType.value, value)
  } catch (err) {
    uni.showToast({ title: t('error.unknown'), icon: 'none' })
  } finally {
    muting.value = false
  }
}

async function onPinChange(value: boolean): Promise<void> {
  if (pinning.value) return
  pinning.value = true
  try {
    await EmKit.pinConversation(props.conversationId, chatType.value, value)
  } catch (err) {
    uni.showToast({ title: t('error.unknown'), icon: 'none' })
  } finally {
    pinning.value = false
  }
}

function onClearHistory(): void {
  if (clearingHistory.value) return
  uni.showModal({
    title: t('chat.info.clearHistory'),
    content: t('chat.info.clearHistoryConfirm'),
    success: (res) => {
      if (!res.confirm || clearingHistory.value) return
      clearingHistory.value = true
      EmKit.clearConversationMessages(props.conversationId, chatType.value)
        .then(() => {
          uni.showToast({ title: t('chat.info.clearHistory'), icon: 'success' })
        })
        .catch(() => {
          uni.showToast({ title: t('error.unknown'), icon: 'none' })
        })
        .finally(() => {
          clearingHistory.value = false
        })
    }
  })
}

function completeExit(): boolean {
  if (exitCompleted.value) return false
  exitCompleted.value = true
  return true
}

function onDelete(): void {
  if (exitPending.value || exitCompleted.value) return
  uni.showModal({
    title: t('chat.info.deleteConversation'),
    content: t('conversation.deleteConfirm'),
    success: (res) => {
      if (!res.confirm || exitPending.value || exitCompleted.value) return
      exitPending.value = true
      deletingConversation.value = true
      EmKit.deleteConversation(props.conversationId, chatType.value)
        .then(() => {
          if (completeExit()) emit('deleted', props.conversationId)
        })
        .catch(() => {
          uni.showToast({ title: t('error.unknown'), icon: 'none' })
        })
        .finally(() => {
          exitPending.value = false
          deletingConversation.value = false
        })
    }
  })
}

// 删除好友与删除会话/退群共用退出锁；成功事件和 toast 均只发生一次。
function onDeleteContact(): void {
  if (exitPending.value || exitCompleted.value) return
  uni.showModal({
    title: t('chat.info.deleteFriend'),
    content: t('chat.info.deleteFriendConfirm'),
    success: (res) => {
      if (!res.confirm || exitPending.value || exitCompleted.value) return
      exitPending.value = true
      deletingContact.value = true
      EmKit.deleteContact(props.conversationId)
        .then(() => {
          if (!completeExit()) return
          uni.showToast({ title: t('chat.info.deleteFriendSuccess'), icon: 'success' })
          emit('contact-deleted', props.conversationId)
        })
        .catch(() => {
          uni.showToast({ title: t('chat.info.deleteFriendFailed'), icon: 'none' })
        })
        .finally(() => {
          exitPending.value = false
          deletingContact.value = false
        })
    }
  })
}

// 退群/解散：二次确认 → domain 退群/解散（内部清群缓存）→ 复用删除会话链路（清消息+删会话）→ emit leaved
function onLeaveOrDestroy(): void {
  if (exitPending.value || exitCompleted.value) return
  const destroy = isOwner.value
  uni.showModal({
    title: destroy ? t('group.destroy') : t('group.leave'),
    content: destroy ? t('group.destroyConfirm') : t('group.leaveConfirm'),
    success: (res) => {
      if (!res.confirm || exitPending.value || exitCompleted.value) return
      exitPending.value = true
      leavingGroup.value = true
      const req = destroy ? EmKit.destroyGroup(props.conversationId) : EmKit.leaveGroup(props.conversationId)
      req
        .then(() => {
          // 会话删除失败不阻断退场（群已退/已散，会话快照随下次同步收敛）
          return EmKit.deleteConversation(props.conversationId, chatType.value).catch(() => {})
        })
        .then(() => {
          if (!completeExit()) return
          uni.showToast({ title: destroy ? t('group.destroySuccess') : t('group.leaveSuccess'), icon: 'success' })
          emit('leaved', props.conversationId)
        })
        .catch(() => {
          uni.showToast({ title: destroy ? t('group.destroyFailed') : t('group.leaveFailed'), icon: 'none' })
        })
        .finally(() => {
          exitPending.value = false
          leavingGroup.value = false
        })
    }
  })
}
</script>

<style>
@import './em-chat-info-page.css';
</style>
