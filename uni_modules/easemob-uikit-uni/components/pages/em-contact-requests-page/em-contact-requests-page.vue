<template>
  <view :class="[ns.b(), themeClass, customClass]" :style="customStyle">
    <!-- primaryColor 内联变量挂内层：蒸汽端同节点 class 变量会顶掉内联变量（坑集 §5k） -->
    <view :class="ns.e('brand-scope')" :style="primaryColorStyle()">
      <!-- 自绘导航栏（宿主页面需配 navigationStyle:custom / App titleNView:false）；返回动作以 back 事件透出，路由由宿主接线 -->
      <em-nav-bar :title="t('contact.newRequests')" @back="emit('back')" />

      <scroll-view :class="ns.e('scroll')" scroll-y>
        <em-empty v-if="invites.length === 0" icon="person-single" :description="t('contact.requests.empty')" />

        <view v-for="invite in invites" :key="invite.id" :class="ns.e('item')">
          <!-- 对方拒绝通知：白底圆形「人 + 双 X」dspntd 48px（对齐 vue contact-notice-list__decline-avatar） -->
          <view v-if="isDeclinedByPeer(invite)" :class="ns.e('decline-avatar')">
            <EmIcon name="dspntd" :size="48" :class="ns.e('decline-avatar-icon')" />
          </view>
          <em-avatar v-else :src="avatarSrcOf(invite)" :name="avatarNameOf(invite)" :size="48" />
          <view :class="ns.e('item-body')">
            <view :class="ns.e('item-main')">
              <em-text :text="titleOf(invite)" :text-class="ns.e('name')" :text-style="nameTextStyle" :class="ns.e('name-host')" />
              <em-text :text="subtitleOf(invite)" :text-class="ns.e('subtitle')" :text-style="subtitleTextStyle" :class="ns.e('subtitle-host')" />
            </view>
            <!-- pending 且收到的申请：接受/拒绝双胶囊按钮（对齐 vue 版 notice 条目操作区） -->
            <view v-if="isActionable(invite)" :class="ns.e('actions')">
              <em-button
                :text="t('contact.requests.accept')"
                type="primary"
                size="medium"
                pill
                :disabled="isProcessing(invite.id)"
                @click="processInvite(invite, 'accept')"
              />
              <view :class="ns.e('action-gap')"></view>
              <em-button
                :text="t('contact.requests.decline')"
                type="outline"
                size="medium"
                pill
                :disabled="isProcessing(invite.id)"
                @click="processInvite(invite, 'decline')"
              />
            </view>
            <text v-else :class="ns.e('status')">{{ statusTextOf(invite) }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EmAvatar from '../../em-avatar/em-avatar.vue'
import EmButton from '../../em-button/em-button.vue'
import EmEmpty from '../../em-empty/em-empty.vue'
import EmIcon from '../../em-icon/em-icon.vue'
import EmNavBar from '../../em-nav-bar/em-nav-bar.vue'
import { EmKit } from '../../../libs'
import { CONTACT_INVITE_KIND, CONTACT_INVITE_STATUS } from '../../../libs/constants'
import { contactStore, convergeContactInvites, isPendingContactInviteForFriend } from '../../../libs/store/contact'
import { primaryColorStyle } from '../../../libs/store/config'
import { groupDisplayNameOf } from '../../../libs/store/group'
import { avatarOf, displayNameOf } from '../../../libs/store/user'
import type { EmContactInvite } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useTheme } from '../../../libs/use/useTheme'
import { useLocale } from '../../../libs/use/useLocale'
import { TEXT_STYLE_NAME, TEXT_STYLE_SUBTITLE } from '../../../libs/style/textStyles'

// 好友申请 + 群邀请列表页（对齐 vue 版 contact-notice-list）：
// 条目 = 48px 头像 + 名称 + 附言副标题；pending 态接受/拒绝双按钮，已处理态弱化状态文字；
// group kind 条目主标题为群名（群名快照 > groupStore > groupId 回落链），接受/拒绝走群邀请 API
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

withDefaults(defineProps<Props>(), {
  customClass: '',
  customStyle: ''
})

// 返回动作以 back 事件透出（宿主页面接线 navigateBack）；必须显式声明，否则模板里的
// emit 在运行时是 undefined（Vue 只暴露 $emit），点返回会 TypeError 且不返回。
const emit = defineEmits<{
  (e: 'back'): void
}>()

// 名称/附言文字内联样式收口 libs/style/textStyles.ts（小程序样式隔离，须走 text-style；详见 em-text 注释）
const nameTextStyle = TEXT_STYLE_NAME
const subtitleTextStyle = TEXT_STYLE_SUBTITLE

const ns = useNamespace('contact-requests-page')
const { themeClass } = useTheme()
const { t } = useLocale()

// 新申请 unshift 置顶，store 顺序即倒序时间序
const invites = computed<EmContactInvite[]>(() => contactStore.invites)

function isGroup(invite: EmContactInvite): boolean {
  return invite.kind === CONTACT_INVITE_KIND.GROUP
}

// 群展示名回落链：邀请快照 groupName > groupStore 详情 > groupId
function groupNameOfInvite(invite: EmContactInvite): string {
  if (invite.groupName != null && invite.groupName !== '') return invite.groupName
  return groupDisplayNameOf(invite.groupId ?? '')
}

function titleOf(invite: EmContactInvite): string {
  return isGroup(invite) ? groupNameOfInvite(invite) : displayNameOf(invite.from)
}

function avatarNameOf(invite: EmContactInvite): string {
  return titleOf(invite)
}

function avatarSrcOf(invite: EmContactInvite): string {
  // group kind 无群头像快照来源（事件载荷不带），走名字占位；contact kind 读用户资料缓存
  return isGroup(invite) ? '' : avatarOf(invite.from)
}

function subtitleOf(invite: EmContactInvite): string {
  if (isGroup(invite)) {
    if (invite.outgoing) {
      // 我方邀请被处理的通知：from 为被邀请人
      return invite.status === CONTACT_INVITE_STATUS.ACCEPTED
        ? t('contact.requests.groupAccepted', { name: displayNameOf(invite.from) })
        : t('contact.requests.groupDeclined', { name: displayNameOf(invite.from) })
    }
    // 收到的群邀请：邀请人 + （有附言时）附言
    const inviter = invite.from !== '' ? t('contact.requests.inviter', { name: displayNameOf(invite.from) }) : ''
    if (invite.message !== '') {
      return inviter !== '' ? `${inviter} · ${invite.message}` : invite.message
    }
    return inviter
  }
  if (invite.outgoing) return t('contact.requests.declinedByPeer')
  return invite.message !== '' ? invite.message : t('contact.requests.received')
}

function statusTextOf(invite: EmContactInvite): string {
  return invite.status === CONTACT_INVITE_STATUS.ACCEPTED
    ? t('contact.requests.accepted')
    : t('contact.requests.declined')
}

function isActionable(invite: EmContactInvite): boolean {
  return !invite.outgoing && invite.status === CONTACT_INVITE_STATUS.PENDING && !isPendingContactInviteForFriend(invite)
}

// 对方拒绝通知（我方发出、已被对方拒绝）：头像位换 dspntd（对齐 vue isDeclinedByPeer）
function isDeclinedByPeer(invite: EmContactInvite): boolean {
  return invite.outgoing && invite.status === CONTACT_INVITE_STATUS.DECLINED
}

// 处理中幂等防重（对齐 vue 版 processingIds）
const processingIds = ref<string[]>([])

function isProcessing(id: string): boolean {
  return processingIds.value.indexOf(id) >= 0
}

function processInvite(invite: EmContactInvite, kind: 'accept' | 'decline'): void {
  if (isPendingContactInviteForFriend(invite)) {
    convergeContactInvites()
    return
  }
  if (!isActionable(invite) || isProcessing(invite.id)) return
  processingIds.value.push(invite.id)
  // group kind 走群邀请接受/拒绝 API（接受成功内部刷新群快照），contact kind 维持好友语义
  const action = isGroup(invite)
    ? (kind === 'accept' ? EmKit.acceptGroupInvite(invite) : EmKit.declineGroupInvite(invite))
    : (kind === 'accept' ? EmKit.acceptContactInvite(invite) : EmKit.declineContactInvite(invite))
  action
    .catch(() => {
      uni.showToast({ title: kind === 'accept' ? t('contact.requests.acceptFailed') : t('contact.requests.declineFailed'), icon: 'none' })
    })
    .finally(() => {
      processingIds.value = processingIds.value.filter((id) => id !== invite.id)
    })
}
</script>

<style>
@import './em-contact-requests-page.css';
</style>
