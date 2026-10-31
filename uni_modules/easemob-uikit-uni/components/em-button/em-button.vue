<template>
  <view :class="[classes, customClass]" :style="customStyle" @click="onClick">
    <EmIcon v-if="loading" name="loading-arc-normal" :size="14" :color="spinnerColor" :class="ns.e('spinner')" :custom-style="spinStyle" />
    <text :class="textClasses">{{ text }}<slot /></text>
  </view>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import { useNamespace } from '../../libs/use/useNamespace'
import { useSpinRotation } from '../../libs/use/useSpinRotation'

// 按钮原子组件（对齐 vue 版 uikit-core EmButton 的一期裁剪：type 四档 + 尺寸两档 + pill/block/disabled/loading）
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  text?: string
  type?: 'default' | 'primary' | 'danger' | 'outline'
  size?: 'large' | 'medium'
  pill?: boolean        // 全圆角胶囊（聊天详情页 footer 按钮形态）
  block?: boolean       // 通栏
  disabled?: boolean
  loading?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  type: 'default',
  size: 'large',
  pill: false,
  block: false,
  disabled: false,
  loading: false,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{ (e: 'click'): void }>()

const ns = useNamespace('button')
// spinner 旋转由 JS 定时器逐帧驱动（蒸汽端不跑 @keyframes，见 useSpinRotation）
const { spinStyle } = useSpinRotation(toRef(props, 'loading'))

const classes = computed(() => [
  ns.b(),
  ns.m(props.type),
  ns.m(props.size),
  props.pill ? ns.m('pill') : '',
  props.block ? ns.m('block') : '',
  props.disabled ? ns.is('disabled') : (props.loading ? ns.is('loading') : '')
])

const spinnerColor = computed(() => {
  if (props.type === 'primary') return 'var(--em-text-inverse)'
  if (props.type === 'danger') return 'var(--em-danger-color)'
  return 'var(--em-text-primary)'
})

// ucss 只有类选择器（无后代选择器保障），文字色/字号走独立的元素修饰类
const textClasses = computed(() => [
  ns.e('text'),
  `${ns.e('text')}--${props.type}`,
  `${ns.e('text')}--${props.size}`
])

function onClick(): void {
  if (props.disabled || props.loading) return
  emit('click')
}
</script>

<style>
@import './em-button.css';
</style>
