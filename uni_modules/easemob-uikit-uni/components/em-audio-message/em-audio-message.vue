<template>
  <view
    :class="[ns.b(), 'em-bubble', message.self ? 'em-bubble--self' : '', playing ? ns.m('playing') : '', customClass]"
    :style="bubbleStyle + customStyle"
    @touchstart="onTouchStart"
    @click="onPlay"
    @longpress="onLongpress"
  >
    <!-- 播放态三根波形柱 + 非播放态 triangle，逐项对齐 vue voice-message；
         柱高由 JS 定时器逐帧驱动（蒸汽端不跑 @keyframes），形成跳动效果 -->
    <view v-if="playing" :class="ns.e('wave')">
      <view
        v-for="(height, index) in waveHeights"
        :key="index"
        :class="[ns.e('wave-bar'), message.self ? 'em-audio-message__wave-bar--self' : '', index > 0 ? ns.m('wave-bar-gap') : '']"
        :style="'height: ' + height + 'px;'"
      ></view>
    </view>
    <EmIcon v-else name="triangle" :size="22" :class="[ns.e('icon'), message.self ? 'em-audio-message__icon--self' : '']" />
    <text :class="[ns.e('duration'), message.self ? 'em-audio-message__duration--self' : '']">{{ durationText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import type { EmMessageItem } from '../../libs/types'
import { playAudio, stopAudio } from '../../libs/platform'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLongPressClickGuard } from '../../libs/use/useLongPressClickGuard'
import { useLocale } from '../../libs/use/useLocale'

interface Props {
  message: EmMessageItem
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const emit = defineEmits<{
  (e: 'long-press', message: EmMessageItem): void
}>()

const ns = useNamespace('audio-message')
const { t } = useLocale()
// H5 长按后仍会补发 click：吞掉长按抬手那一次 click，避免菜单与语音播放同时触发
const { onTouchStart, shouldSkipClick } = useLongPressClickGuard()

// 微信式宽度阶梯：随时长线性缩放，夹在 [72, 240]（对齐 vue 版 VOICE_MIN/MAX/PX_PER_SECOND）
const MIN_WIDTH = 72
const MAX_WIDTH = 240
const PX_PER_SECOND = 6

const durationSeconds = computed(() => Math.max(0, Math.round(props.message.duration)))

const bubbleStyle = computed(() => {
  const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, durationSeconds.value * PX_PER_SECOND))
  return `width: ${w}px;`
})

const durationText = computed(() => t('message.seconds', { seconds: durationSeconds.value }))

const playing = ref(false)

// 播放中的三根波柱跳动：蒸汽端不跑 CSS @keyframes，改 JS 定时器逐帧改高度（同引用定位脉冲口径）。
// 4 帧循环、180ms/帧；高度夹在 12px 容器内，不触发布局宽度变化。
const WAVE_FRAMES: number[][] = [
  [4, 9, 6],
  [9, 5, 10],
  [6, 10, 5],
  [10, 6, 8]
]
const WAVE_INTERVAL = 180
const waveHeights = ref<number[]>([...WAVE_FRAMES[0]])
let waveTimer: ReturnType<typeof setInterval> | null = null
let waveFrame = 0

function stopWave(): void {
  if (waveTimer != null) {
    clearInterval(waveTimer)
    waveTimer = null
  }
}

function startWave(): void {
  stopWave()
  waveFrame = 0
  waveHeights.value = [...WAVE_FRAMES[0]]
  waveTimer = setInterval(() => {
    waveFrame = (waveFrame + 1) % WAVE_FRAMES.length
    waveHeights.value = [...WAVE_FRAMES[waveFrame]]
  }, WAVE_INTERVAL)
}

// 播放全局互斥在 platform.playAudio 内（播新停旧，旧播放经 onEnd 回调复位）
function onPlay(): void {
  if (shouldSkipClick()) return
  if (playing.value) {
    stopWave()
    stopAudio()
    return
  }
  const url = props.message.url
  if (url === '') return
  playing.value = true
  startWave()
  playAudio(url, () => {
    playing.value = false
    stopWave()
  })
}

function onLongpress(): void {
  emit('long-press', props.message)
}

onUnmounted(() => {
  stopWave()
  if (playing.value) {
    stopAudio()
  }
})
</script>

<style>
@import './em-audio-message.css';
</style>
