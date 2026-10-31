<template>
  <!-- 成员管理视图：chat-info 页内全屏覆盖层（页内视图切换，不碰路由），back 回主视图；
       z-index 低于弹层基准 2000（action-sheet/select-contact 等 em-popup 族恒在其上） -->
  <view :class="ns.b()">
    <!-- 标题栏：复用 em-nav-bar（状态栏/胶囊避让内置），back 回主视图；覆盖层全屏盖住主视图导航栏，恒单 header -->
    <em-nav-bar :title="navTitle" @back="emit('back')" />

    <em-search-bar v-model="keyword" :placeholder="t('group.memberSearchPlaceholder')" />

    <scroll-view :class="ns.e('scroll')" scroll-y @scrolltolower="onScrollToLower">
      <!-- 首屏成员加载骨架：条目形态对齐真实成员行（40 圆头像 + 名单行 + 角色角标偶现行），逐行变宽 -->
      <view v-if="initialLoading && members.length === 0" :class="ns.e('skeleton')">
        <view v-for="(width, index) in SKELETON_NAME_WIDTHS" :key="index" :class="ns.e('skeleton-item')">
          <em-skeleton variant="avatar" shape="circle" width="40px" height="40px" />
          <view :class="ns.e('skeleton-main')">
            <em-skeleton :width="width" height="14px" />
          </view>
          <view v-if="SKELETON_ROLE_ROWS[index]" :class="ns.e('skeleton-role')" />
        </view>
      </view>
      <em-empty
        v-else-if="initialLoadFailed && members.length === 0"
        icon="circle-bang"
        :description="t('group.memberLoadFailed')"
      >
        <em-button type="outline" size="medium" pill :text="t('common.retry')" :loading="initialLoading" :disabled="initialLoading" @click="loadInitialMembers" />
      </em-empty>
      <em-empty
        v-else-if="!initialLoading && displayMembers.length === 0 && groupStore.memberMapByGroupId[props.groupId] != null"
        :icon="keyword.trim() !== '' ? 'search' : 'person-double'"
        :description="keyword.trim() !== '' ? t('group.memberNoResult') : t('group.memberEmpty')"
      />

      <!-- 成员行：头像 + 展示名（单行省略）+ 角色角标（owner 蓝/admin 橙实底白字，对齐 vue member-list-item）；右侧更多开操作菜单 -->
      <view v-for="m in displayMembers" :key="m.userId" :class="ns.e('item')">
        <em-avatar :src="memberAvatar(m)" :name="memberName(m)" :size="40" />
        <view :class="ns.e('item-main')">
          <em-text :text="memberName(m)" :text-class="ns.e('name')" :text-style="nameTextStyle" :class="ns.e('name-host')" />
          <text v-if="m.role === GROUP_MEMBER_ROLE.OWNER" :class="[ns.e('role'), ns.m('role-owner')]">{{ t('group.role.owner') }}</text>
          <text v-else-if="m.role === GROUP_MEMBER_ROLE.ADMIN" :class="[ns.e('role'), ns.m('role-admin')]">{{ t('group.role.admin') }}</text>
        </view>
        <view v-if="hasActions(m)" :class="ns.e('more')" @click="onOpenActions(m)">
          <EmIcon name="vertical" :size="16" :class="ns.e('more-icon')" />
        </view>
      </view>

      <!-- 游标翻页：按钮式为主（对齐 vue group-member-list 自持 cursor 模式），scrolltolower 同入口兜底；搜索态隐藏 -->
      <em-load-more v-if="keyword.trim() === '' && displayMembers.length > 0" :state="loadMoreState" @load="onLoadMore" />
    </scroll-view>

    <!-- 成员操作菜单：按角色权限动态生成（页面根级弹层，不进 scroll-view） -->
    <em-action-sheet
      :visible="sheetVisible"
      :actions="memberActions"
      :title="activeMemberName"
      @select="onAction"
      @update:visible="sheetVisible = $event"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EmActionSheet from '../../em-action-sheet/em-action-sheet.vue'
import EmAvatar from '../../em-avatar/em-avatar.vue'
import EmEmpty from '../../em-empty/em-empty.vue'
import EmButton from '../../em-button/em-button.vue'
import EmIcon from '../../em-icon/em-icon.vue'
import EmLoadMore from '../../em-load-more/em-load-more.vue'
import EmNavBar from '../../em-nav-bar/em-nav-bar.vue'
import EmSearchBar from '../../em-search-bar/em-search-bar.vue'
import EmSkeleton from '../../em-skeleton/em-skeleton.vue'
import EmText from '../../em-text/em-text.vue'
import { EmKit } from '../../../libs'
import { GROUP_MEMBER_ACTION, GROUP_MEMBER_ROLE, LOAD_MORE_STATE } from '../../../libs/constants'
import type { GroupMemberRoleValue, LoadMoreStateValue } from '../../../libs/constants'
import { connectionStore } from '../../../libs/store/connection'
import { groupMemberDisplayNameOf, groupStore, sortGroupMembers } from '../../../libs/store/group'
import { avatarOf } from '../../../libs/store/user'
import { canRemoveGroupMember } from '../../../libs/utils/group'
import { TEXT_STYLE_NAME } from '../../../libs/style/textStyles'
import type { EmActionSheetAction, EmGroupMember } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useLocale } from '../../../libs/use/useLocale'

// chat-info 群分支成员管理视图（页面级内聚拆分，与 em-group-info-blocks 同目录显式 import）：
// 全量成员列表（owner>admin>joinedAt 排序 + 角色角标 + 搜索过滤）+ 按钮式游标翻页 +
// 成员操作菜单（私聊/设撤管理员/转让群主/移出群聊，按角色权限动态生成）。
// 数据直读 groupStore（与宿主页面同源），操作经 EmKit 群域写方法（成功内部回写 store）。
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  groupId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  // 回主视图（页内视图切换，不碰路由）
  (e: 'back'): void
  // 私聊意图：宿主接线发起单聊（addConversation + 跳聊天页）
  (e: 'chat-member', userId: string): void
}>()

const ns = useNamespace('group-members-view')
const { t } = useLocale()

const nameTextStyle = TEXT_STYLE_NAME

// ========== 成员列表（排序 + 搜索过滤） ==========

const keyword = ref('')
const initialLoading = ref(false)
const initialLoadFailed = ref(false)

const members = computed(() => groupStore.memberMapByGroupId[props.groupId] ?? [])

// 首屏骨架行宽预设：名单宽度逐行变化；角色角标只给前两行（对齐真实 owner/admin 偶现行）
const SKELETON_NAME_WIDTHS = ['36%', '48%', '28%', '44%', '52%', '32%', '40%', '56%']
const SKELETON_ROLE_ROWS = [true, true, false, false, false, false, false, false]

const memberCount = computed(() => {
  const info = groupStore.infoByGroupId[props.groupId]
  if (info != null) return info.memberCount
  return members.value.length
})

// 导航标题：「群成员 (N)」（对齐 vue group-member-list header 的标题 + 计数语义）
const navTitle = computed(() => `${t('group.members')} (${memberCount.value})`)

// 展示序：owner > admin > joinedAt（复用 sortGroupMembers，不改 store 原顺序——分页 append 依赖原顺序）
const displayMembers = computed<EmGroupMember[]>(() => {
  const sorted = sortGroupMembers(members.value)
  const kw = keyword.value.trim().toLowerCase()
  if (kw === '') return sorted
  return sorted.filter((m) =>
    memberName(m).toLowerCase().includes(kw) || m.userId.toLowerCase().includes(kw)
  )
})

function memberName(m: EmGroupMember): string {
  return groupMemberDisplayNameOf(props.groupId, m.userId)
}

function memberAvatar(m: EmGroupMember): string {
  return m.avatar ?? avatarOf(m.userId)
}

const loadingMore = ref(false)
const loadMoreFailed = ref(false)
const hasMore = computed(() => groupStore.memberHasMoreByGroupId[props.groupId] === true)

// 与 domain 最新请求写保护配套：首屏、分页和移除后强制首屏共享视图代次。
// 新请求接管 loading；旧成功/失败不得清除或创建当前错误，旧 finally 不得释放新请求状态。
let memberRequestGeneration = 0

function beginMemberRequest(): number {
  memberRequestGeneration += 1
  initialLoading.value = false
  loadingMore.value = false
  return memberRequestGeneration
}

function isCurrentMemberRequest(generation: number): boolean {
  return generation === memberRequestGeneration
}

function isStaleMemberRejection(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  return (error as { applied?: unknown }).applied === false
}

// 首屏：无缓存时拉第一页（enterGroup 预热通常已就位，此处兜底）；失败保留可重试状态。
// 移除后强制刷新传 force=true，绕过普通首屏锁并提升代次；notifyFailure=false 保留 best-effort 提示语义。
async function loadInitialMembers(force = false, notifyFailure = true): Promise<void> {
  if (initialLoading.value && !force) return
  const generation = beginMemberRequest()
  initialLoading.value = true
  loadMoreFailed.value = false
  try {
    const outcome = await EmKit.getGroupMemberList(props.groupId)
    if (!isCurrentMemberRequest(generation)) return
    if (!outcome.applied) {
      // 外部更新也可能使本请求失效；若没有更新的缓存，必须留下可重试态而非空白。
      if (groupStore.memberMapByGroupId[props.groupId] == null) {
        initialLoadFailed.value = true
      }
      return
    }
    initialLoadFailed.value = false
    loadMoreFailed.value = false
  } catch (e) {
    if (!isCurrentMemberRequest(generation)) return
    if (isStaleMemberRejection(e)) {
      if (groupStore.memberMapByGroupId[props.groupId] == null) {
        initialLoadFailed.value = true
      }
      return
    }
    initialLoadFailed.value = true
    loadMoreFailed.value = false
    if (notifyFailure) {
      uni.showToast({ title: t('group.memberLoadFailed'), icon: 'none' })
    }
  } finally {
    if (isCurrentMemberRequest(generation)) {
      initialLoading.value = false
    }
  }
}

onMounted(() => {
  if (groupStore.memberMapByGroupId[props.groupId] == null) {
    loadInitialMembers()
  }
})

// ========== 游标翻页（domain 内部回写 store 游标/hasMore，这里维护 loading 锁与失败重试态） ==========

const loadMoreState = computed<LoadMoreStateValue>(() => {
  if (loadingMore.value) return LOAD_MORE_STATE.LOADING
  if (loadMoreFailed.value) return LOAD_MORE_STATE.ERROR
  return hasMore.value ? LOAD_MORE_STATE.BUTTON : LOAD_MORE_STATE.NO_MORE
})

function onScrollToLower(): void {
  onLoadMore()
}

async function onLoadMore(): Promise<void> {
  if (loadingMore.value || (!hasMore.value && !loadMoreFailed.value)) return
  const generation = beginMemberRequest()
  loadingMore.value = true
  initialLoadFailed.value = false
  loadMoreFailed.value = false
  try {
    const outcome = await EmKit.getGroupMemberList(props.groupId, groupStore.memberCursorByGroupId[props.groupId])
    if (!isCurrentMemberRequest(generation)) return
    if (!outcome.applied) return
    loadMoreFailed.value = false
  } catch (e) {
    if (!isCurrentMemberRequest(generation)) return
    if (isStaleMemberRejection(e)) return
    loadMoreFailed.value = true
    uni.showToast({ title: t('group.memberLoadFailed'), icon: 'none' })
  } finally {
    if (isCurrentMemberRequest(generation)) {
      loadingMore.value = false
    }
  }
}

// ========== 角色判定（memberMap 为准，owner 字段兜底，与 chat-info-page 同口径） ==========

const selfRole = computed<GroupMemberRoleValue | null>(() =>
  members.value.find((m) => m.userId === connectionStore.userId)?.role ?? null
)
const actorRole = computed<GroupMemberRoleValue | null>(() => {
  if (selfRole.value != null) return selfRole.value
  if (connectionStore.userId !== '' && groupStore.infoByGroupId[props.groupId]?.owner === connectionStore.userId) {
    return GROUP_MEMBER_ROLE.OWNER
  }
  return null
})
const isOwner = computed(() => actorRole.value === GROUP_MEMBER_ROLE.OWNER)

// ========== 成员操作菜单（em-action-sheet，按角色权限动态生成） ==========

const sheetVisible = ref(false)
const activeMember = ref<EmGroupMember | null>(null)
let pendingOperation: Promise<void> | null = null

const activeMemberName = computed(() => (activeMember.value != null ? memberName(activeMember.value) : ''))

// 任意角色对非自己可私聊；owner 可设撤管理员/转让，移除权限与批量入口共用 canRemoveGroupMember。
function actionsOf(m: EmGroupMember): EmActionSheetAction[] {
  if (m.userId === connectionStore.userId) return []
  const actions: EmActionSheetAction[] = [
    { key: GROUP_MEMBER_ACTION.CHAT, text: t('group.memberAction.chat'), icon: 'bubble-circle' }
  ]
  if (isOwner.value && m.role !== GROUP_MEMBER_ROLE.OWNER) {
    if (m.role === GROUP_MEMBER_ROLE.ADMIN) {
      actions.push({ key: GROUP_MEMBER_ACTION.REMOVE_ADMIN, text: t('group.memberAction.removeAdmin'), icon: 'shield-person' })
    } else {
      actions.push({ key: GROUP_MEMBER_ACTION.SET_ADMIN, text: t('group.memberAction.setAdmin'), icon: 'shield-person' })
    }
    actions.push({ key: GROUP_MEMBER_ACTION.TRANSFER_OWNER, text: t('group.memberAction.transferOwner'), icon: 'person-arrows' })
  }
  if (canRemoveGroupMember(connectionStore.userId, actorRole.value, m)) {
    actions.push({ key: GROUP_MEMBER_ACTION.REMOVE, text: t('group.memberAction.remove'), icon: 'person-minus' })
  }
  return actions
}

function hasActions(m: EmGroupMember): boolean {
  return actionsOf(m).length > 0
}

const memberActions = computed<EmActionSheetAction[]>(() =>
  activeMember.value != null ? actionsOf(activeMember.value) : []
)

function onOpenActions(m: EmGroupMember): void {
  if (pendingOperation != null || actionsOf(m).length === 0) return
  activeMember.value = m
  sheetVisible.value = true
}

function revalidateTarget(actionKey: string, userId: string, failureKey: string): EmGroupMember | null {
  const target = members.value.find((m) => m.userId === userId) ?? null
  let valid = target != null
  if (target != null) {
    if (actionKey === GROUP_MEMBER_ACTION.SET_ADMIN) {
      valid = isOwner.value && target.role === GROUP_MEMBER_ROLE.MEMBER
    } else if (actionKey === GROUP_MEMBER_ACTION.REMOVE_ADMIN) {
      valid = isOwner.value && target.role === GROUP_MEMBER_ROLE.ADMIN
    } else if (actionKey === GROUP_MEMBER_ACTION.TRANSFER_OWNER) {
      valid = isOwner.value && target.userId !== connectionStore.userId && target.role !== GROUP_MEMBER_ROLE.OWNER
    } else if (actionKey === GROUP_MEMBER_ACTION.REMOVE) {
      valid = canRemoveGroupMember(connectionStore.userId, actorRole.value, target)
    }
  }
  if (!valid) {
    uni.showToast({ title: t(failureKey), icon: 'none' })
    return null
  }
  return target
}

async function refreshAfterRemoval(): Promise<void> {
  await Promise.all([
    EmKit.getGroupInfo(props.groupId, true).catch(() => {}),
    loadInitialMembers(true, false)
  ])
}

// 所有成员写操作共享同一条可 await pending 链；旧请求未完成时不启动新请求。
function runOp(req: () => Promise<void>, successKey: string, failureKey: string): Promise<void> {
  if (pendingOperation != null) return pendingOperation
  const operation = Promise.resolve()
    .then(req)
    .then(() => {
      uni.showToast({ title: t(successKey), icon: 'success' })
    })
    .catch(() => {
      uni.showToast({ title: t(failureKey), icon: 'none' })
    })
    .finally(() => {
      if (pendingOperation === operation) {
        pendingOperation = null
      }
    })
  pendingOperation = operation
  return operation
}

function onAction(action: EmActionSheetAction): void {
  const m = activeMember.value
  if (m == null || pendingOperation != null) return
  if (action.key === GROUP_MEMBER_ACTION.CHAT) {
    emit('chat-member', m.userId)
    return
  }
  if (action.key === GROUP_MEMBER_ACTION.SET_ADMIN) {
    uni.showModal({
      title: t('group.memberAction.setAdmin'),
      content: t('group.memberAction.setAdminConfirm', { name: memberName(m) }),
      success: (res) => {
        if (!res.confirm || pendingOperation != null) return
        const target = revalidateTarget(action.key, m.userId, 'group.memberAction.setAdminFailed')
        if (target == null) return
        runOp(
          () => EmKit.addGroupAdmin(props.groupId, target.userId),
          'group.memberAction.setAdminSuccess',
          'group.memberAction.setAdminFailed'
        )
      }
    })
    return
  }
  if (action.key === GROUP_MEMBER_ACTION.REMOVE_ADMIN) {
    uni.showModal({
      title: t('group.memberAction.removeAdmin'),
      content: t('group.memberAction.removeAdminConfirm', { name: memberName(m) }),
      success: (res) => {
        if (!res.confirm || pendingOperation != null) return
        const target = revalidateTarget(action.key, m.userId, 'group.memberAction.removeAdminFailed')
        if (target == null) return
        runOp(
          () => EmKit.removeGroupAdmin(props.groupId, target.userId),
          'group.memberAction.removeAdminSuccess',
          'group.memberAction.removeAdminFailed'
        )
      }
    })
    return
  }
  if (action.key === GROUP_MEMBER_ACTION.TRANSFER_OWNER) {
    uni.showModal({
      title: t('group.memberAction.transferOwner'),
      content: t('group.memberAction.transferConfirm', { name: memberName(m) }),
      success: (res) => {
        if (!res.confirm || pendingOperation != null) return
        const target = revalidateTarget(action.key, m.userId, 'group.memberAction.transferFailed')
        if (target == null) return
        runOp(
          () => EmKit.changeGroupOwner(props.groupId, target.userId),
          'group.memberAction.transferSuccess',
          'group.memberAction.transferFailed'
        )
      }
    })
    return
  }
  if (action.key === GROUP_MEMBER_ACTION.REMOVE) {
    uni.showModal({
      title: t('group.memberAction.remove'),
      content: t('group.memberAction.removeConfirm', { name: memberName(m) }),
      success: (res) => {
        if (!res.confirm || pendingOperation != null) return
        const target = revalidateTarget(action.key, m.userId, 'group.memberRemoveFailed')
        if (target == null) return
        runOp(async () => {
          await EmKit.removeGroupMembers(props.groupId, [target.userId])
          await refreshAfterRemoval()
        }, 'group.memberRemoveSuccess', 'group.memberRemoveFailed')
      }
    })
  }
}
</script>

<style>
@import './em-group-members-view.css';
</style>
