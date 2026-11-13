<template>
  <view :class="[rootClass, customClass]" :style="rootStyle + customStyle">
    <image
      v-if="showImage"
      :class="imgClass"
      :src="src"
      mode="aspectFill"
      @error="onImageError"
    />
    <text v-else :class="ns.e('name')" :style="nameStyle">{{ displayName }}</text>
    <view v-if="hasBadge" :class="ns.e('badge')" :style="badgePosStyle">
      <em-badge :count="badge" :max="badgeMax" :dot="badgeDot" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EmBadge from '../em-badge/em-badge.vue'
import { useConfig } from '../../libs/store/config'
import { useNamespace } from '../../libs/use/useNamespace'

// 文字头像占位底色板（平移自 Web 版 avatar.vue）：按 name 首字符 hash 取色；
// 可经 placeholderColors prop 覆盖（空数组回退默认板）
const PLACEHOLDER_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa']

interface Props {
  src?: string
  name?: string
  size?: number
  shape?: 'circle' | 'square'
  badge?: number
  badgeDot?: boolean
  badgeMax?: number
  placeholderColors?: string[]
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  name: '',
  size: 40,
  badge: 0,
  badgeDot: false,
  badgeMax: 99,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const ns = useNamespace('avatar')
const { config } = useConfig()
const resolvedShape = computed(() => props.shape ?? config.avatarShape)

const loadFailed = ref(false)
const showImage = computed(() => props.src.length > 0 && !loadFailed.value)

const displayName = computed(() => props.name.slice(0, 2))

const placeholderColor = computed(() => {
  // 未传或传空数组时回退默认五色板（模块常量）
  const palette = props.placeholderColors != null && props.placeholderColors.length > 0 ? props.placeholderColors : PLACEHOLDER_COLORS
  if (props.name.length === 0) return palette[0]
  return palette[props.name.charCodeAt(0) % palette.length]
})

const rootClass = computed(() => [ns.b(), ns.m(resolvedShape.value)])
const rootStyle = computed(() => {
  const base = `width: ${props.size}px; height: ${props.size}px;`
  if (showImage.value) return base
  return `${base} background-color: ${placeholderColor.value};`
})
const imgClass = computed(() => [ns.e('img'), ns.m(resolvedShape.value)])
const nameStyle = computed(() => `font-size: ${Math.round(props.size * 0.4)}px;`)

// 徽标内置（平移 Web 版规范）：定位偏移随头像尺寸换算（基准 48px → 负偏移 = 直径/4）；
// 药丸/圆点本体与数字截断收口在 em-badge
const hasBadge = computed(() => props.badgeDot || props.badge > 0)
const badgeDiameter = computed(() =>
  Math.round(props.size * (props.badgeDot ? 9 : 20) / 48)
)
const badgePosStyle = computed(() => {
  const offset = -Math.round(badgeDiameter.value / 4)
  return `top: ${offset}px; right: ${offset}px;`
})

function onImageError(): void {
  loadFailed.value = true
}
</script>

<style>
@import './em-avatar.css';
</style>
