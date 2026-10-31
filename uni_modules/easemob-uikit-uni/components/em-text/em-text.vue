<template>
  <view :class="[ns.b(), customClass]" :style="customStyle">
    <text :class="[ns.e('value'), clampClass, textClass]" :style="textStyle">{{ text }}<slot /></text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'

// 文本溢出/折叠/断词收口组件：所有可能溢出的用户内容文本一律走这里。
// 布局 class（flex/min-width/margin 等）落在组件标签上（宿主 = 根 view）。
// 文字样式双通道：
// - textClass 走 class（H5/App 生效）；
// - textStyle 走内联 style——小程序样式隔离下父组件 wxss 够不到本组件内部 text
//  （app-and-page 编译为 apply-shared，只放行页面级样式；实测会话摘要字体颜色全失效），
//   内联 style 不受隔离限制，跨端使用必须同时给 textStyle（var() token 引用可用）。
interface Props {
  text?: string
  lines?: number      // 默认 1 行折叠省略；0 = 不折叠、只做长文断词
  textClass?: string
  textStyle?: string
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  lines: 1,
  textClass: '',
  textStyle: '',
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const ns = useNamespace('text')

// 折叠行数走 class（lines 属性经 wxss 管线已验证可落产物）；目前只用 1/2 两档
const clampClass = computed(() => {
  if (props.lines <= 0) return 'em-text__value--wrap'
  if (props.lines === 2) return 'em-text__value--line2'
  return 'em-text__value--line1'
})
</script>

<style>
@import './em-text.css';
</style>
