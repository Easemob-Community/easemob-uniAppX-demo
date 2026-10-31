<template>
  <!-- 组件级水印内容层：铺满父容器并裁切旋转溢出；穿透/层级由页面覆盖层壳负责（见各页面 __watermark） -->
  <view :class="[ns.b(), customClass]" :style="rootStyle">
    <view :class="ns.e('layer')" :style="layerStyle">
      <view v-for="row in rowCount" :key="row" :class="ns.e('row')">
        <text v-for="col in columnCount" :key="col" :class="ns.e('text')" :style="textStyle">{{ text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'

// 水印平铺原子组件（M2.27）：只做内容，不做定位/穿透——覆盖层壳由页面提供
// （absolute + 四边 0 + z-index:10 + pointer-events:none + overflow:hidden，对齐 vue 版 #watermark 契约）。
//
// 铺满策略（对尺寸 API 不敏感的定案）：
//   1) 平铺层用百分比尺寸（200% × 140%）+ 负偏移 + 整层旋转，旋转后恒大于容器，
//      因此「覆盖」不依赖窗口尺寸，也不会在 H5 首帧/桌面缩放时留白；
//   2) 行列数只决定密度：按窗口宽度与文案估算宽算列数，再按容器宽高比算行数（近似即可，
//      算错只影响疏密，不影响覆盖）；
//   3) 每行 `space-between` 均分、每行 `flex:1` 均分行高——不需要 measurement / canvas / 图片。
// 旋转只落在整层 view 上（`<text>` 拍平后 transform 不保证生效），每个瓦片仅一个 text，规避 §5d。

defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  /** 水印文案；空串不渲染（运行期开关用它，不要切 v-if，见坑集 §5q） */
  text: string
  /** 字号（px），默认 12 */
  fontSize?: number
  /** 整层不透明度，默认 0.08 */
  opacity?: number
  /** 旋转角度（度），默认 -20 */
  rotate?: number
  /** 文字颜色，默认 var(--em-text-primary)（暗色随主题反转） */
  color?: string
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  fontSize: 12,
  opacity: 0.08,
  rotate: -20,
  color: 'var(--em-text-primary)',
  customClass: '',
  customStyle: ''
})

const ns = useNamespace('watermark')

/** 行高倍率：蒸汽端行高用 px，不用无单位倍数 */
const LINE_HEIGHT_RATIO = 1.4
/** 平铺层相对容器的倍数：200% × 140%，-20° 旋转后恒大于容器（不依赖窗口尺寸） */
const LAYER_WIDTH_RATIO = 2
const LAYER_HEIGHT_RATIO = 1.4
/** 瓦片最小横向留白（px），用于列数密度估算 */
const TILE_GAP_X = 56

const windowInfo = uni.getWindowInfo()
const WINDOW_WIDTH = Number(windowInfo.windowWidth) > 0 ? Number(windowInfo.windowWidth) : 375
const WINDOW_HEIGHT = Number(windowInfo.windowHeight) > 0 ? Number(windowInfo.windowHeight) : 667
const WINDOW_RATIO = WINDOW_HEIGHT > 0 && WINDOW_WIDTH > 0 ? WINDOW_HEIGHT / WINDOW_WIDTH : 1.8

/** 文案宽度估算（按码点：CJK/emoji ≈ 1em，其余 ≈ 0.55em） */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0
  let index = 0
  while (index < text.length) {
    const code = text.charCodeAt(index)
    // 代理对（emoji 等）按 1em 计，跳过低位代理
    if (code >= 0xd800 && code <= 0xdbff) {
      width += fontSize
      index += 2
      continue
    }
    width += code > 0x2e80 ? fontSize : fontSize * 0.55
    index += 1
  }
  return width
}

/** 列数：平铺层宽 2×屏宽，单瓦片宽 = 估宽 + 留白，夹在 2–6 列 */
const columnCount = computed(() => {
  if (props.text === '') return 0
  const cellWidth = Math.max(props.fontSize * 4, estimateTextWidth(props.text, props.fontSize) + TILE_GAP_X)
  const columns = Math.floor((WINDOW_WIDTH * LAYER_WIDTH_RATIO) / cellWidth)
  return Math.min(6, Math.max(2, columns))
})

/** 行数：按容器宽高比放大列数（近似值，只影响疏密） */
function rowsOf(columns: number): number {
  const rows = Math.round(columns * WINDOW_RATIO * 1.2)
  return Math.min(18, Math.max(6, rows))
}

/** 空文案不渲染瓦片：避免隐藏态白建几十个节点 */
const rowCount = computed(() => (props.text === '' ? 0 : rowsOf(columnCount.value)))

const rootStyle = computed(() => {
  const hidden = props.text === '' ? 'display:none;' : ''
  const extra = props.customStyle !== '' ? props.customStyle : ''
  return `opacity:${props.opacity};${hidden}${extra}`
})

// 平铺层：百分比尺寸 + 负偏移让容器位于其中心，再整层旋转
const layerStyle = computed(
  () =>
    `left:${Math.round((1 - LAYER_WIDTH_RATIO) * 50)}%;` +
    `top:${Math.round((1 - LAYER_HEIGHT_RATIO) * 50)}%;` +
    `width:${LAYER_WIDTH_RATIO * 100}%;height:${LAYER_HEIGHT_RATIO * 100}%;` +
    `transform: rotate(${props.rotate}deg);transform-origin: center;`
)

const textStyle = computed(
  () =>
    `font-size:${props.fontSize}px;` +
    `line-height:${Math.round(props.fontSize * LINE_HEIGHT_RATIO)}px;` +
    `color:${props.color};`
)
</script>

<style>
@import './em-watermark.css';
</style>
