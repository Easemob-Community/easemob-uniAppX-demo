<template>
  <text :class="[ns.b(), customClass]" :style="iconStyle + customStyle" @click="onClick">{{ glyph }}</text>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'
import { EmIcons, type EmIconName } from './em-icons'

interface Props {
  name: EmIconName
  size?: number
  color?: string
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  color: '',
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const emit = defineEmits<{ (e: 'click'): void }>()

const ns = useNamespace('icon')

const glyph = computed(() => EmIcons[props.name])
const iconStyle = computed(() => {
  const base = `font-size: ${props.size}px; width: ${props.size}px; height: ${props.size}px;`
  return props.color.length > 0 ? `${base} color: ${props.color};` : base
})

function onClick(): void {
  emit('click')
}
</script>

<style>
@import './em-icon.css';
</style>
