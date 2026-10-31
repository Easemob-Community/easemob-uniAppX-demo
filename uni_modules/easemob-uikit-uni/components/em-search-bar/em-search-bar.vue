<template>
  <view :class="[ns.b(), customClass]" :style="customStyle">
    <view :class="ns.e('box')">
      <EmIcon name="search" :size="16" :class="ns.e('icon')" />
      <input
        :class="ns.e('input')"
        v-model="text"
        :placeholder="placeholder"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import { useNamespace } from '../../libs/use/useNamespace'

// 搜索条原子组件（对齐 vue 版 input variant="search" 移动端口径）：
// 36px 高圆角条 + 前置 search 图标；placeholder 由宿主传入 i18n 文案（两页 key 不同）
interface Props {
  modelValue: string
  placeholder?: string
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('search-bar')

// v-model 走 modelValue/update:modelValue（与 em-chat-inputbar 同风格，computed 中转）
const text = computed<string>({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v)
})
</script>

<style>
@import './em-search-bar.css';
</style>
