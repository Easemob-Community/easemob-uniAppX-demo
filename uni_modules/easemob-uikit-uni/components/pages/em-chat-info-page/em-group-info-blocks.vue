<template>
  <view :class="ns.b()">
    <!-- 成员宫格：角色排序前 8 名 + 添加格 + 移除格 + 下方「查看全部」（对齐 vue chat-info-drawer 成员区） -->
    <view v-if="showMemberGrid" :class="ns.e('section')">
      <view :class="ns.e('section-label-row')">
        <text :class="ns.e('section-label')">{{ t('group.members') }} ({{ memberCount }})</text>
      </view>
      <!-- 假搜索框：readonly 视觉同搜索输入框，点击进成员管理视图（对齐 vue fake-search，常驻入口） -->
      <view :class="ns.e('fake-search')" @click="emit('open-members', props.groupId)">
        <EmIcon name="search" :size="20" :class="ns.e('fake-search-icon')" />
        <text :class="ns.e('fake-search-text')">{{ t('group.memberSearchPlaceholder') }}</text>
      </view>
      <view :class="ns.e('grid')">
        <view v-for="m in gridMembers" :key="m.userId" :class="ns.e('grid-cell')">
          <em-avatar :src="memberAvatar(m)" :name="memberName(m)" :size="48" />
          <em-text :text="memberName(m)" :text-class="ns.e('grid-name')" :text-style="gridNameTextStyle" :class="ns.e('grid-name-host')" />
        </view>
        <!-- 添加格：打开邀请入群弹层（chat-info-page 库内闭环）；群主/管理员恒可见，普通成员需群允许邀请（对齐 vue canAddMember） -->
        <view v-if="canAddMember" :class="ns.e('grid-cell')" @click="emit('invite', props.groupId)">
          <view :class="ns.e('grid-action-circle')">
            <EmIcon name="plus" :size="20" :class="ns.e('grid-action-icon')" />
          </view>
          <text :class="ns.e('grid-name')">{{ t('chat.info.add') }}</text>
        </view>
        <!-- 移除格：打开移除成员选人弹层（chat-info-page 库内闭环）；仅群主/管理员可见（对齐 vue canRemoveMembers） -->
        <view v-if="canRemoveMembers" :class="ns.e('grid-cell')" @click="emit('remove', props.groupId)">
          <view :class="ns.e('grid-action-circle')">
            <EmIcon name="minus" :size="20" :class="ns.e('grid-action-icon')" />
          </view>
          <text :class="ns.e('grid-name')">{{ t('group.memberList.remove') }}</text>
        </view>
      </view>
      <!-- 查看全部：成员超首屏时显示（对齐 vue view-all），点击进成员管理视图 -->
      <view v-if="hasMoreMembers" :class="ns.e('view-all')" @click="emit('open-members', props.groupId)">
        <text :class="ns.e('view-all-text')">{{ t('chat.info.checkAll') }}</text>
        <EmIcon name="chevron-down" :size="16" :class="ns.e('view-all-icon')" />
      </view>
    </view>

    <!-- 群名称字段行：owner 可编辑（笔图标，点击 emit edit-name），非 owner 只读 -->
    <view v-if="showGroupName" :class="ns.e('field')" @click="onNameFieldClick">
      <text :class="ns.e('field-label')">{{ t('group.name') }}</text>
      <view :class="ns.e('field-main')">
        <em-text :text="groupName" :text-class="ns.e('field-value')" :text-style="fieldValueTextStyle" :class="ns.e('field-value-host')" />
        <!-- 群名扩展位（标签/业务徽标）：宿主经 EmKit.setGroupPresentation 注入 ext 后自绘，缺省不渲染不占位 -->
        <slot name="name-extra" :group-id="groupId" :name="groupName" :ext="groupExt" />
        <EmIcon v-if="canEditName" name="rect-notched-pen" :size="22" :class="ns.e('field-action-icon')" />
      </view>
    </view>

    <!-- 群公告字段行：点击 emit show-announcement（查看全文弹层由页面根级渲染） -->
    <view v-if="showAnnouncement" :class="ns.e('field')" @click="emit('show-announcement', props.groupId)">
      <text :class="ns.e('field-label')">{{ t('group.announcement') }}</text>
      <view :class="ns.e('field-main')">
        <em-text :text="announcement !== '' ? announcement : t('group.announcementEmpty')" :text-class="ns.e('field-value')" :text-style="announcementTextStyle" :class="ns.e('field-value-host')" />
        <EmIcon name="rect-notched-pen" :size="22" :class="ns.e('field-action-icon')" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmAvatar from '../../em-avatar/em-avatar.vue'
import EmIcon from '../../em-icon/em-icon.vue'
import EmText from '../../em-text/em-text.vue'
import { GROUP_MEMBER_GRID_COUNT } from '../../../libs/constants'
import type { EmGroupMember } from '../../../libs/types'
import { groupDisplayNameOf, groupMemberDisplayNameOf, groupStore, sortGroupMembers } from '../../../libs/store/group'
import { avatarOf } from '../../../libs/store/user'
import { useConfig } from '../../../libs/store/config'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useLocale } from '../../../libs/use/useLocale'

// chat-info 群分支区块（页面级内聚拆分，纯展示）：成员宫格 + 群名称 + 群公告字段行。
// 数据直读 groupStore（与宿主页面同源）；编辑/查看弹层由 em-group-field-dialog 在页面根级
// 渲染（弹层组件一律挂页面根、不进 scroll-view，全库既有范式），本组件只发意图事件。
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  groupId: string
  isOwner: boolean
  isAdmin: boolean
  /** 成员宫格显隐（伪装预留），默认 true */
  showMemberGrid?: boolean
  /** 群名称字段行显隐（伪装预留），默认 true */
  showGroupName?: boolean
  /** 群公告字段行显隐（伪装预留），默认 true */
  showAnnouncement?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showMemberGrid: true,
  showGroupName: true,
  showAnnouncement: true
})

const emit = defineEmits<{
  // 邀请入群意图（宿主 chat-info-page 库内闭环弹层；事件同时透传给页面宿主）
  (e: 'invite', groupId: string): void
  // 移除成员意图（宿主 chat-info-page 库内闭环选人弹层；事件同时透传给页面宿主）
  (e: 'remove', groupId: string): void
  // 成员管理视图意图（宿主 chat-info-page 页内视图切换）
  (e: 'open-members', groupId: string): void
  // 群名称编辑意图（仅 owner 发出；弹层在页面根级）
  (e: 'edit-name', groupId: string): void
  // 群公告查看意图（弹层在页面根级）
  (e: 'show-announcement', groupId: string): void
}>()

const ns = useNamespace('group-info-blocks')
const { t } = useLocale()
const { config } = useConfig()

// ========== 成员宫格 ==========

const memberCount = computed(() => {
  const info = groupStore.infoByGroupId[props.groupId]
  if (info != null) return info.memberCount
  return (groupStore.memberMapByGroupId[props.groupId] ?? []).length
})

// 首屏成员：owner > admin > joinedAt 排序，展示上限 GROUP_MEMBER_GRID_COUNT（对齐 vue displayedMembers = 8，操作格另计）
const gridMembers = computed<EmGroupMember[]>(() => {
  const members = groupStore.memberMapByGroupId[props.groupId] ?? []
  return sortGroupMembers(members).slice(0, GROUP_MEMBER_GRID_COUNT)
})

// 操作格权限（对齐 vue chat-info-drawer）：添加 = 群主/管理员恒可见，普通成员需群允许邀请；移除 = 仅群主/管理员
const canAddMember = computed(() => {
  if (props.isOwner || props.isAdmin) return true
  return groupStore.infoByGroupId[props.groupId]?.allowInvites === true
})
const canRemoveMembers = computed(() => props.isOwner || props.isAdmin)

// 查看全部按钮：成员总数超首屏展示数时显示（对齐 vue hasMoreMembers）
const hasMoreMembers = computed(() => memberCount.value > gridMembers.value.length)

function memberName(m: EmGroupMember): string {
  return groupMemberDisplayNameOf(props.groupId, m.userId)
}

function memberAvatar(m: EmGroupMember): string {
  return m.avatar ?? avatarOf(m.userId)
}

const gridNameTextStyle =
  'font-family: var(--em-font-family); font-size: var(--em-font-size-11); line-height: 16px; color: var(--em-text-primary); white-space: nowrap; text-align: center; margin-top: 4px;'

// ========== 群名称 ==========

const groupName = computed(() => groupDisplayNameOf(props.groupId))

// 群业务载荷（宿主 EmKit.setGroupPresentation 注入），随 #name-extra 插槽 scope 透出
const groupExt = computed(() => groupStore.overrideByGroupId[props.groupId]?.ext)

const fieldValueTextStyle =
  'font-family: var(--em-font-family); font-size: var(--em-font-size-15); line-height: 22px; font-weight: var(--em-font-weight-medium); color: var(--em-text-primary); white-space: nowrap;'

// 群名称可编辑：owner 且 uiConfig.enableGroupNameEdit（M2.20，默认开；宿主删配置即隐藏笔入口，行仍只读展示）
const canEditName = computed(() => props.isOwner && config.enableGroupNameEdit)

function onNameFieldClick(): void {
  if (!canEditName.value) return
  emit('edit-name', props.groupId)
}

// ========== 群公告 ==========

const announcement = computed(() => groupStore.announcementByGroupId[props.groupId] ?? '')

// 空公告占位档：常规字重 + 三级文字色（双通道内联，对齐 vue is-placeholder）
const announcementTextStyle = computed(() => {
  const base =
    'font-family: var(--em-font-family); font-size: var(--em-font-size-15); line-height: 22px; white-space: nowrap;'
  if (announcement.value === '') {
    return `${base} font-weight: var(--em-font-weight-regular); color: var(--em-text-tertiary);`
  }
  return `${base} font-weight: var(--em-font-weight-medium); color: var(--em-text-primary);`
})
</script>

<style>
@import './em-group-info-blocks.css';
</style>
