<template>
  <!-- 字母索引条（对齐 vue 版 contact-alphabet-nav）：始终渲染完整 A-Z + # 序列；
       容器撑满列表区高度，字母格 flex:1 等比分配（单项封顶 20px、字号 9px/500）；
       点按走单元格 touchstart 精确命中（无需几何测量），按住滑动走容器 touchmove 占比映射 -->
  <view
    :class="[ns.b(), customClass]"
    :style="customStyle"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <view
      v-for="key in keys"
      :key="key"
      :class="cellClass(key)"
      @touchstart="onCellTouchStart(key)"
    >
      <text :class="textClass(key)">{{ key }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { ALPHABET_KEYS } from '../../libs/constants'
import { useNamespace } from '../../libs/use/useNamespace'
import { resolveAlphabetKeyByOffsetY } from '../../libs/utils/pinyin'

// 字母索引条原子组件：点击/滑动定位分组（微信通讯录式占比映射）
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  keys?: string[]        // 渲染序列，默认完整 A-Z + '#'
  activeKey?: string     // 当前高亮字母（空串无高亮）
  dimKeys?: string[]     // 无对应分组的字母：淡化且不响应
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  keys: () => [...ALPHABET_KEYS],
  activeKey: '',
  dimKeys: () => [],
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  // sliding=false 点按定位（可平滑滚动）；sliding=true 滑动定位（须瞬时滚动防动画排队）
  (e: 'jump', key: string, sliding: boolean): void
}>()

const ns = useNamespace('alphabet-nav')

function isDim(key: string): boolean {
  return props.dimKeys.indexOf(key) >= 0
}

function cellClass(key: string): string {
  return [
    ns.e('cell'),
    key === props.activeKey ? 'em-alphabet-nav__cell--active' : '',
    isDim(key) ? 'em-alphabet-nav__cell--dim' : ''
  ].join(' ').trim()
}

function textClass(key: string): string {
  return [
    ns.e('text'),
    key === props.activeKey ? 'em-alphabet-nav__text--active' : ''
  ].join(' ').trim()
}

// 滑动态：touchmove 需要容器几何，惰性查询一次缓存；查询失败仅滑动失效，点按不受影响
let sliding = false
let rectTop = 0
let rectHeight = 0
let rectReady = false
let lastKey = ''
const instance = getCurrentInstance()

function onCellTouchStart(key: string): void {
  if (isDim(key)) return
  sliding = true
  lastKey = key
  emit('jump', key, false)
  queryRect()
}

function queryRect(): void {
  if (rectReady) return
  try {
    uni.createSelectorQuery()
      .in(instance)
      .select('.em-alphabet-nav')
      .boundingClientRect()
      .exec((res) => {
        const rect = res[0] as { top: number, height: number } | null
        if (rect != null && rect.height > 0) {
          rectTop = rect.top
          rectHeight = rect.height
          rectReady = true
        }
      })
  } catch (e) {
    // 蒸汽端查询不可用时滑动定位静默降级
  }
}

function onTouchMove(e: TouchEvent): void {
  if (!sliding || !rectReady) return
  const touch = e.touches[0]
  if (touch == null) return
  const key = resolveAlphabetKeyByOffsetY(touch.clientY - rectTop, rectHeight, props.keys)
  if (key === '' || key === lastKey || isDim(key)) return
  lastKey = key
  emit('jump', key, true)
}

function onTouchEnd(): void {
  sliding = false
  lastKey = ''
}
</script>

<style>
@import './em-alphabet-nav.css';
</style>
