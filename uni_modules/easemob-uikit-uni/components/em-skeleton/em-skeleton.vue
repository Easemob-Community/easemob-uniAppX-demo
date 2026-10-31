<template>
  <!-- avatar：单块圆形/圆角头像占位 -->
  <view
    v-if="variant === 'avatar'"
    :class="[ns.b(), ns.m('avatar'), shapeClass, customClass]"
    :style="boxStyle + customStyle"
  />
  <!-- text：单行占位，高 1em -->
  <view
    v-else-if="variant === 'text'"
    :class="[ns.b(), ns.m('text'), customClass]"
    :style="boxStyle + customStyle"
  />
  <!-- paragraph：多行占位，末行宽 60%（vue 版口径），行间距 8px -->
  <view v-else :class="[ns.b(), ns.m('paragraph'), customClass]" :style="customStyle">
    <view
      v-for="index in safeRows"
      :key="index"
      :class="[ns.e('line'), index === safeRows ? ns.m('last') : '']"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'

// 骨架屏原子组件（视觉契约对齐 vue 版 EmSkeleton）：
// 底色 --em-bg-hover + 圆角 token；shimmer 动画因 ucss 禁伪元素一期不做（PLAN M2.7 留二期）
interface Props {
  variant?: 'avatar' | 'text' | 'paragraph'  // 默认 text；card variant 无消费点留二期
  shape?: 'circle' | 'square' | 'rounded'    // 仅 avatar 生效，默认 circle
  rows?: number                              // 仅 paragraph 生效，默认 3
  width?: string                             // 覆盖默认宽度（如 '40%'）
  height?: string                            // 覆盖默认高度（如 '48px'）
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'text',
  shape: 'circle',
  rows: 3,
  width: '',
  height: '',
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('skeleton')

const shapeClass = computed(() => ns.m(`avatar-${props.shape}`))
const safeRows = computed(() => Math.max(1, Math.floor(props.rows)))

// text 行默认高 1em（font-size 由宿主文字列上下文决定）；avatar 默认 40×40
const boxStyle = computed(() => {
  const styles: string[] = []
  if (props.width !== '') styles.push(`width: ${props.width}`)
  if (props.height !== '') styles.push(`height: ${props.height}`)
  return styles.join('; ')
})
</script>

<style>
@import './em-skeleton.css';
</style>
