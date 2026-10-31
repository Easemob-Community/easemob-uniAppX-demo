<template>
  <!-- 自绘导航栏（页面需配 navigationStyle:custom / App titleNView:false）：系统栏右上角在小程序被
       胶囊独占，只能整体自绘；右侧 action 经 capsulePad 预留胶囊宽度落在其左侧（微信/TUIKit 通行做法） -->
  <view :class="[ns.b(), customClass]" :style="headerStyle + customStyle">
    <view v-if="showBack" :class="ns.e('back')" @click="onBack">
      <EmIcon name="chevron-left" :size="22" :class="ns.e('back-icon')" />
    </view>
    <view :class="[ns.e('main'), showBack ? 'em-nav-bar__main--after-back' : '']">
      <slot name="title">
        <text :class="ns.e('title')">{{ title }}</text>
      </slot>
      <text v-if="subtitle !== ''" :class="ns.e('subtitle')">{{ subtitle }}</text>
    </view>
    <view v-if="actionIcon !== '' || slots.action != null" :class="ns.e('action')" @click="onAction">
      <slot name="action">
        <EmIcon :name="actionIcon" :size="22" :class="ns.e('action-icon')" />
      </slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useSlots } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import type { EmIconName } from '../em-icon/em-icons'
import { useNamespace } from '../../libs/use/useNamespace'
import { getSafeAreaTop } from '../../libs/use/useSafeArea'

// 自绘导航栏原子组件：safe-top + 44px 内容行；小程序胶囊避让内置（#ifdef MP-WEIXIN 量胶囊矩形）；
// #title / #action 具名插槽可覆盖默认文本标题与图标按钮（有插槽内容时优先）
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  title?: string
  subtitle?: string      // 副标题（如 typing 提示），空串不渲染
  showBack?: boolean     // 左侧返回箭头，默认 true
  actionIcon?: EmIconName | ''   // 右侧动作图标，空串不渲染
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  showBack: true,
  actionIcon: '',
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'action'): void
}>()

const ns = useNamespace('nav-bar')
const slots = useSlots()

// 小程序端胶囊独占右上角：预留 胶囊左边距 + 胶囊宽 + 8px 间隔；其它端常规 12px
let capsuleRightPad = 12
// #ifdef MP-WEIXIN
const menuRect = uni.getMenuButtonBoundingClientRect()
capsuleRightPad = (uni.getWindowInfo().windowWidth - menuRect.right) + menuRect.width + 8
// #endif
const headerStyle = `padding-top: ${getSafeAreaTop()}px; padding-right: ${capsuleRightPad}px;`

function onBack(): void {
  emit('back')
}

function onAction(): void {
  emit('action')
}
</script>

<style>
@import './em-nav-bar.css';
</style>
