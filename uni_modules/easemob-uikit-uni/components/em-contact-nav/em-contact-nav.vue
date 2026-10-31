<template>
  <!-- 通讯录入口项列表（对齐 vue 版 ContactNav）：可选左图标 + 标题(内联计数) + hot 红点 + 右箭头。
       纯呈现原子组件：不连 store、不碰路由，点击原样透出 entry key 由宿主接线。
       图标/红点一律 view 包裹——mp 样式隔离下父组件 wxss 够不到子组件宿主节点 -->
  <view :class="[ns.b(), customClass]" :style="customStyle">
    <view
      v-for="entry in entries"
      :key="entry.key"
      :class="ns.e('item')"
      @click="emit('entry-click', entry.key)"
    >
      <view v-if="entry.icon" :class="ns.e('icon')"><EmIcon :name="entry.icon" :size="20" /></view>
      <!-- 计数内联进标题（对齐 vue entryTitle：count>0 时「好友列表 (5)」），右侧无数字徽标 -->
      <text :class="ns.e('label')">{{ entryText(entry) }}</text>
      <!-- hot 红点：仅 count>0 时生效（对齐 vue 语义，8px 圆点而非数字） -->
      <view v-if="entry.hot === true && hasCount(entry)" :class="ns.e('dot')"><em-badge dot /></view>
      <view :class="ns.e('spacer')"></view>
      <EmIcon name="chevron-right" :size="22" />
    </view>
  </view>
</template>

<script setup lang="ts">
import EmBadge from '../em-badge/em-badge.vue'
import EmIcon from '../em-icon/em-icon.vue'
import type { EmContactNavEntry } from '../../libs/types'
import { useNamespace } from '../../libs/use/useNamespace'

interface Props {
  /** 入口配置列表，按数组顺序展示（内置 key 见 CONTACT_ENTRY_KEY） */
  entries: EmContactNavEntry[]
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

withDefaults(defineProps<Props>(), {
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'entry-click', key: string): void
}>()

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('contact-nav')

function hasCount(entry: EmContactNavEntry): boolean {
  return entry.count != null && entry.count > 0
}

// 对齐 vue entryTitle：计数内联拼进标题（count>0 时「好友列表 (5)」）
function entryText(entry: EmContactNavEntry): string {
  return hasCount(entry) ? `${entry.label} (${entry.count ?? 0})` : entry.label
}
</script>

<style>
@import './em-contact-nav.css';
</style>
