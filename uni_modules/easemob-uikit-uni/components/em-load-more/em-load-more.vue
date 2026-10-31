<template>
  <!-- 触底加载统一 footer：四态收口（loading 旋转 spinner + 文案 / noMore / button、error 可点）。
       消费契约：scroll-view @scrolltolower → 消费方检查 hasMore && !loading 锁 → 触发加载并切 state -->
  <view :class="[ns.b(), customClass]" :style="customStyle">
    <view v-if="state === LOAD_MORE_STATE.LOADING" :class="ns.e('row')">
      <EmIcon name="loading-arc-normal" :size="14" :class="ns.e('spinner')" :custom-style="spinStyle" />
      <text :class="ns.e('text')">{{ t('common.loading') }}</text>
    </view>
    <view v-else-if="state === LOAD_MORE_STATE.BUTTON || state === LOAD_MORE_STATE.ERROR" :class="ns.e('row')" @click="emit('load')">
      <text :class="[ns.e('text'), 'em-load-more__text--button']">{{ state === LOAD_MORE_STATE.ERROR ? t('common.loadFailed') : t('common.loadMore') }}</text>
    </view>
    <view v-else :class="ns.e('row')">
      <text :class="ns.e('text')">{{ t('common.noMore') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import { LOAD_MORE_STATE } from '../../libs/constants'
import type { LoadMoreStateValue } from '../../libs/constants'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'
import { useSpinRotation } from '../../libs/use/useSpinRotation'

// 触底加载 footer 原子组件（对齐 vue 版 group-member-list 尾部按钮 / group-list load-more 区）：
// spinner 由 useSpinRotation JS 定时器逐帧旋转（蒸汽端不跑 @keyframes），状态枚举收口 constants
interface Props {
  state: LoadMoreStateValue
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'load'): void
}>()

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('load-more')
const { t } = useLocale()
// 仅 LOADING 态旋转；ERROR/BUTTON 态不渲染 spinner，watch 自动停止并归零
const { spinStyle } = useSpinRotation(
  computed(() => props.state === LOAD_MORE_STATE.LOADING)
)
</script>

<style>
@import './em-load-more.css';
</style>
