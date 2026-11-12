<template>
  <view
    :class="[ns.b(), item.isPinned ? ns.m('pinned') : '', customClass]"
    :style="customStyle"
    @touchstart="onTouchStart"
    @click="onClick(item.conversationId)"
    @longpress="onLongPress(item.conversationId)"
  >
    <slot name="avatar" :item="item" :avatar="avatar" :ext="ext">
      <em-avatar :src="avatar" :name="name" :size="48" :shape="avatarShape" />
    </slot>
    <view :class="ns.e('body')">
      <view :class="ns.e('top')">
        <view :class="ns.e('name-wrap')">
          <!-- 群聊有人@我：名字前 at 14px 主色（对齐 vue conversation-item__at-me-icon） -->
          <EmIcon v-if="hasAtMe" name="at" :size="14" :class="ns.e('at-me-icon')" />
          <!-- hasAtMe 时名字主色高亮（对齐 vue 版 conversation-item__name.is-at-me），text-class/text-style 双通道同步切档 -->
          <slot name="title" :item="item" :name="name" :ext="ext">
            <em-text :text="name" :text-class="ns.e('name') + (hasAtMe ? ' ' + ns.m('name-at-me') : '')" :text-style="hasAtMe ? nameAtMeTextStyle : nameTextStyle" :class="ns.e('name-host')" />
          </slot>
          <!-- 标题扩展位（标签/业务徽标）：宿主经 EmKit.setConversationPresentation 注入 ext 后自绘，缺省不渲染不占位 -->
          <slot name="title-extra" :item="item" :name="name" :ext="ext" />
          <!-- 置顶/免打扰徽标：12px 弱化图标色（对齐 vue 版 filled/pin、filled/bell-slash）；view 包裹——mp 样式隔离下父组件 wxss 够不到子组件宿主 -->
          <view v-if="item.isPinned" :class="ns.e('flag')"><EmIcon name="pin-filled" :size="12" /></view>
          <view v-if="item.isMuted" :class="ns.e('flag')"><EmIcon name="bell-slash-filled" :size="12" /></view>
        </view>
        <text :class="ns.e('time')">{{ timeText }}</text>
      </view>
      <view :class="ns.e('bottom')">
        <view :class="ns.e('message')">
          <!-- 群聊「有人@我」主色前缀（对齐 vue 版 conversation-item__at-me-prefix：primary + medium，atMe 期间优先于草稿态） -->
          <text v-if="hasAtMe" :class="ns.e('at-me')">{{ t('conversation.atMeInMessage') }}</text>
          <!-- 草稿态：rect/pencil 14px 警示色 + [草稿]（对齐 vue conversation-item__draft-icon） -->
          <block v-else-if="draft != null">
            <EmIcon name="rect-pencil" :size="14" :class="ns.e('draft-icon')" />
            <text :class="ns.e('draft')">[{{ t('conversation.draft') }}]</text>
          </block>
          <em-text :text="draft != null ? draft.text : item.lastMessageText" :text-class="ns.e('summary')" :text-style="summaryTextStyle" :class="ns.e('summary-host')" />
        </view>
        <!-- 免打扰未读降级为静默点，其余数字徽标（99+ 截断收口 em-badge）；view 包裹避 mp 宿主类失效 -->
        <view v-if="item.unreadCount > 0" :class="ns.e('unread')">
          <em-badge v-if="item.isMuted" dot />
          <em-badge v-else :count="item.unreadCount" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import EmAvatar from '../em-avatar/em-avatar.vue'
import EmBadge from '../em-badge/em-badge.vue'
import EmIcon from '../em-icon/em-icon.vue'
import EmText from '../em-text/em-text.vue'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'
import { useLongPressClickGuard } from '../../libs/use/useLongPressClickGuard'
import { TEXT_STYLE_NAME, TEXT_STYLE_SUBTITLE } from '../../libs/style/textStyles'
import type { EmAvatarShape, EmConversationItem } from '../../libs/types'

// 会话列表条目原子组件：页面已装配好的展示数据（名称/头像回落链、五档时间、草稿态）整体透传，
// 组件内不连 store（对齐 vue 版 conversation-item 的数据契约：conversation + 展示字段，裁剪 @我/typing/presence 等一期外能力）
interface Props {
  item: EmConversationItem                          // 会话数据（含置顶/免打扰/未读数/摘要）
  name: string                                      // 展示名（页面侧已走 nickname > conversation.name > id 回落链）
  avatar: string                                    // 头像 URL（已合并 userStore 与 conversation.avatar）
  avatarShape?: EmAvatarShape                       // 头像形状，默认圆形
  timeText: string                                  // 五档格式化时间（formatConversationTime，草稿时间优先在页面侧已并入）
  draft: { text: string, time: number } | null      // 草稿态；null 展示最后消息摘要
  hasAtMe?: boolean                                 // 群聊「有人@我」未读标记（摘要主色前缀），默认 false
  ext?: Record<string, unknown>                     // 宿主业务载荷（EmKit.setConversationPresentation 注入），随 #title/#title-extra/#avatar scope 透出
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

withDefaults(defineProps<Props>(), {
  avatarShape: 'circle',
  hasAtMe: false,
  ext: undefined,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'click', conversationId: string): void
  (e: 'long-press', conversationId: string): void
}>()

defineOptions({ styleIsolation: 'app-and-page' })

// 名称/摘要文字内联样式收口 libs/style/textStyles.ts（小程序样式隔离，须走 text-style；详见 em-text 注释）
const nameTextStyle = TEXT_STYLE_NAME
// hasAtMe 名字主色高亮档（对齐 vue 版 is-at-me）：与 TEXT_STYLE_NAME 同档仅换色，双通道的 text-style 侧
const nameAtMeTextStyle =
  'font-family: var(--em-font-family); font-size: var(--em-font-size-15); font-weight: var(--em-font-weight-semibold); line-height: 20px; color: var(--em-primary-color); white-space: nowrap;'
const summaryTextStyle = TEXT_STYLE_SUBTITLE

const ns = useNamespace('conversation-item')
const { t } = useLocale()

// H5 长按后浏览器仍会补发 click：长按菜单与点击进会话会同时触发，这里吞掉长按抬手那一次 click
const { onTouchStart, shouldSkipClick } = useLongPressClickGuard()

function onClick(conversationId: string): void {
  if (shouldSkipClick()) return
  emit('click', conversationId)
}

function onLongPress(conversationId: string): void {
  emit('long-press', conversationId)
}
</script>

<style>
@import './em-conversation-item.css';
</style>
