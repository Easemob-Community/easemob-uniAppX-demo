<template>
  <!-- 常驻挂载（无 v-if）：蒸汽端新建 v-if 分支时，节点可能只建出命中区、不建视觉节点
       （Android 真机插桩实测约 3/12：JS 侧 watch/渲染 effect 全部正常、连内联背景色都不落笔），
       表现为「底部 tabBar 已收起、弹层却看不见，且全屏点击被吞掉」。
       改为页面挂载时就把弹层树建好，打开/关闭只切根节点的 top（关闭=移出视口下方 200%），
       不再创建/销毁节点，也就没有「新分支丢渲染」的可能。详见坑集 §5q。
       注意：默认态即最终态——遮罩默认不透明、面板默认在最终位置；进场动画只做「附加位移」（JS 逐帧），
       禁止再用 class/opacity/translateY(100%) 表达「隐藏态」。 -->
  <view
    :class="[ns.b(), themeClass, position === 'center' ? 'em-popup--center' : '', customClass]"
    :style="rootStyle"
  >
    <view :class="ns.e('overlay')" @click="onMaskClick"></view>
    <view
      :class="[ns.e('panel'), position === 'center' ? 'em-popup__panel--center' : '', fullscreen ? 'em-popup__panel--full' : '']"
      :style="panelStyle"
    >
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { holdTabBar, nextZIndex, releaseTabBar } from '../../libs/use/usePopup'
import { getSafeAreaBottom } from '../../libs/use/useSafeArea'
import { useNamespace } from '../../libs/use/useNamespace'
import { useTheme } from '../../libs/use/useTheme'

interface Props {
  visible: boolean
  position?: 'bottom' | 'center'
  maskClosable?: boolean
  safeArea?: boolean
  /** 全屏形态（bottom 专用）：面板去顶部圆角，由内容方配 100% 高（对齐 vue mobileFullscreen） */
  fullscreen?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  position: 'bottom',
  maskClosable: true,
  safeArea: true,
  fullscreen: false,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'mask-click'): void
}>()

const ns = useNamespace('popup')
const { themeClass } = useTheme()

const zIndex = ref(2000)

// 关闭态：整棵弹层移到视口下方（position: fixed 的 top 百分比按视口高算），既不绘制也不接收点击。
// 只改这一个内联样式（节点早已挂载），不涉及 v-if 建树。
const CLOSED_STYLE = 'top: 200%;'

// 进场动画（JS 逐帧，同 useSpinRotation 思路）：
// 蒸汽端不能把「可见性」放在动画起点上（CSS 的 translateY(100%)/opacity:0 + 挂载后翻 class 都会偶发丢），
// 所以动画只做「附加位移」——面板默认就在最终位置，打开时整块从屏下（100%）滑回 0%，逐帧写内联 transform。
// 任意一帧丢写只会少一段动画/位置差一截（仍然可见可点），绝不会变成「看不见但吃点击」（坑集 §5q）。
const SLIDE_DURATION_MS = 200
const SLIDE_FRAME_MS = 16
// 位移用百分比：相对面板自身高度，100% 就是"整块藏在屏下"，和 vue 版的观感一致
const SLIDE_START_PCT = 100
// -1 = 终态（不写内联 transform）；>=0 = 动画中的位移百分比
const slideOffset = ref(-1)
let slideTimer: ReturnType<typeof setTimeout> | null = null

function clearSlideTimer(): void {
  if (slideTimer == null) return
  clearTimeout(slideTimer)
  slideTimer = null
}

function stopSlide(): void {
  clearSlideTimer()
  slideOffset.value = -1
}

function startSlide(): void {
  clearSlideTimer()
  const startAt = Date.now()
  slideOffset.value = SLIDE_START_PCT
  const step = (): void => {
    const progress = Math.min(1, (Date.now() - startAt) / SLIDE_DURATION_MS)
    const eased = 1 - Math.pow(1 - progress, 3)
    // 尾段（>85%）直接归零：即使最后一帧写入被丢，面板也已经停在终态
    slideOffset.value = progress > 0.85 ? 0 : Math.round((1 - eased) * SLIDE_START_PCT)
    if (progress < 1) {
      slideTimer = setTimeout(step, SLIDE_FRAME_MS)
      return
    }
    slideTimer = null
    slideOffset.value = -1
  }
  slideTimer = setTimeout(step, SLIDE_FRAME_MS)
}

// 原生 tabBar 持锁：实例级配对（持有才释放），避免把别的弹层的锁放掉
let tabBarHeld = false

function acquireTabBar(): void {
  if (tabBarHeld) return
  tabBarHeld = true
  holdTabBar()
}

function releaseTabBarOfInstance(): void {
  if (!tabBarHeld) return
  tabBarHeld = false
  releaseTabBar()
}

watch(() => props.visible, (v) => {
  if (v) {
    zIndex.value = nextZIndex()
    acquireTabBar()
    startSlide()
    return
  }
  // 关闭不做退场动画：收起必须是"一次写就必达"的动作，动画收尾的那次写若被丢会留下幽灵弹层
  stopSlide()
  releaseTabBarOfInstance()
}, { immediate: true })

onUnmounted(() => {
  clearSlideTimer()
  releaseTabBarOfInstance()
})

const rootStyle = computed(() => {
  const closed = props.visible ? '' : CLOSED_STYLE
  return `z-index: ${zIndex.value};` + closed + props.customStyle
})

const panelStyle = computed(() => {
  // 进场位移：默认不写 transform（终态=CSS 里的最终位置），只有动画期间才写内联偏移
  let style = slideOffset.value >= 0 ? `transform: translateY(${slideOffset.value}%);` : ''
  if (props.position !== 'bottom' || !props.safeArea) return style
  const bottom = getSafeAreaBottom()
  if (bottom > 0) {
    style += `padding-bottom: ${bottom}px;`
  }
  return style
})

function onMaskClick(): void {
  emit('mask-click')
  if (props.maskClosable) {
    emit('update:visible', false)
  }
}
</script>

<style>
@import './em-popup.css';
</style>
