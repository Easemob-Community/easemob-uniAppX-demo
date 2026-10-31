<template>
  <!-- 会话筛选 tab（对齐 vue 版 conversation-tabs）：胶囊横排、溢出横向滑动、无计数徽标。
       纯呈现原子组件：不连 store，激活态 props 进、change 事件出 -->
  <scroll-view :class="[ns.b(), customClass]" :style="customStyle" scroll-x :show-scrollbar="false">
    <view :class="ns.e('track')">
      <view
        v-for="tab in tabs"
        :key="tab"
        :class="[ns.e('tab'), tab === active ? ns.m('tab-active') : '']"
        @click="emit('change', tab)"
      >
        <text :class="[ns.e('tab-text'), tab === active ? ns.m('tab-text-active') : '']">{{ labelOf(tab) }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CONVERSATION_TAB_KEY, DEFAULT_CONVERSATION_TABS, type ConversationTabKeyValue } from '../../libs/constants'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

interface Props {
  /** 展示的 tab 及顺序，默认全部五项（all/unread/atMe/single/group） */
  tabs?: ConversationTabKeyValue[]
  /** 当前激活 tab */
  active: ConversationTabKeyValue
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  tabs: () => DEFAULT_CONVERSATION_TABS,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'change', tab: ConversationTabKeyValue): void
}>()

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('conversation-tabs')
const { t } = useLocale()

// 文案表对齐 vue 版 conversation-tabs tabLabels
const labels = computed<Record<ConversationTabKeyValue, string>>(() => ({
  [CONVERSATION_TAB_KEY.ALL]: t('conversation.tabAll'),
  [CONVERSATION_TAB_KEY.UNREAD]: t('conversation.tabUnread'),
  [CONVERSATION_TAB_KEY.AT_ME]: t('conversation.tabAtMe'),
  [CONVERSATION_TAB_KEY.SINGLE]: t('conversation.tabSingle'),
  [CONVERSATION_TAB_KEY.GROUP]: t('conversation.tabGroup')
}))

function labelOf(tab: ConversationTabKeyValue): string {
  return labels.value[tab] ?? tab
}
</script>

<style>
@import './em-conversation-tabs.css';
</style>
