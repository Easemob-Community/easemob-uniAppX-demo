<template>
  <view :class="[ns.b(), ns.m(size), customClass]" :style="customStyle">
    <EmIcon v-if="icon !== ''" :name="icon" :size="iconSize" :class="ns.e('icon')" />
    <text v-if="title !== ''" :class="ns.e('title')">{{ title }}</text>
    <text v-if="description !== ''" :class="ns.e('description')">{{ description }}</text>
    <slot />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'
import EmIcon from '../em-icon/em-icon.vue'
import type { EmIconName } from '../em-icon/em-icons'

// 空状态原子组件（视觉契约对齐 vue 版 EmEmpty）：
// 图标（em-icon 字体，无 SVG 插画档）+ 标题/描述两行文案 + #default 附加区
interface Props {
  icon?: EmIconName | ''  // em-icon 名；空串不渲染图标
  title?: string          // 标题（一期消费点未用，契约对齐 vue 版预留）
  description?: string    // 描述/主文案
  size?: 'small' | 'normal' | 'large'  // 图标 32/48/64，默认 normal
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  icon: '',
  title: '',
  description: '',
  size: 'normal',
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('empty')

const ICON_SIZE = { small: 32, normal: 48, large: 64 } as const
const iconSize = computed(() => ICON_SIZE[props.size])
</script>

<style>
@import './em-empty.css';
</style>
