<template>
  <view v-if="visible" :class="[ns.b(), props.dot ? ns.m('dot') : ns.m('count'), customClass]" :style="customStyle">
    <text v-if="!props.dot" :class="ns.e('text')">{{ displayText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'

// 徽标原子组件：数字截断（99+）收口，0/负数不渲染（dot 除外）；
// 尺寸配色平移自三处既有消费点（会话列表未读 / 联系人新请求入口 / 头像角标）
interface Props {
  count?: number   // 徽标数字；超过 max 显示 "max+"；0/负数不渲染（dot 模式除外）
  max?: number     // 截断阈值，默认 99
  dot?: boolean    // 红点模式：仅 8px 圆点不显示数字
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
  max: 99,
  dot: false,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const ns = useNamespace('badge')

const visible = computed(() => props.dot || props.count > 0)
const displayText = computed(() =>
  props.count > props.max ? `${props.max}+` : `${props.count}`
)
</script>

<style>
@import './em-badge.css';
</style>
