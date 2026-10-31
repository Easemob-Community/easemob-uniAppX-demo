<template>
  <view v-if="visible" :class="[ns.b(), customClass]" :style="customStyle">
    <!-- 顶部工具条与视频分区：关闭键不压在原生 video 上，任何端的原生组件层级都能点得到 -->
    <view :class="ns.e('bar')" :style="barStyle">
      <view :class="ns.e('close')" @click="onClose">
        <EmIcon name="xmark-bold" :size="18" color="#ffffff" />
      </view>
    </view>
    <view :class="ns.e('stage')">
      <!-- 原生 video：App 用下载到本地的临时文件（EaseMob chatfiles 不支持 Range，AVPlayer 远程播放会一直转圈）；
           H5/小程序直接用远程 URL -->
      <video
        v-if="!preparing"
        :id="VIDEO_ID"
        :class="ns.e('video')"
        :src="playSrc"
        :autoplay="false"
        :controls="true"
        :show-progress="true"
        :show-fullscreen-btn="true"
        object-fit="contain"
        @play="onPlay"
        @error="onError"
      />
      <!-- App 下载阶段：JS 定时器驱动 spinner（蒸汽端不跑 CSS 动画），有进度时显示百分比 -->
      <view v-if="preparing" :class="ns.e('loading')">
        <image v-if="poster !== ''" :class="ns.e('loading-poster')" :src="poster" mode="aspectFit" />
        <view :class="ns.e('loading-body')">
          <EmIcon name="loading-arc-normal" :size="24" color="#ffffff" :custom-style="spinStyle" />
          <text :class="ns.e('loading-text')">{{ loadingText }}</text>
        </view>
      </view>
      <!-- 播放失败（地址失效/编码不支持/网络异常）：保留黑底与关闭键，给出可读提示而不是静默黑屏 -->
      <view v-if="failed && !preparing" :class="ns.e('error')">
        <text :class="ns.e('error-text')">{{ t('message.video.playFailed') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onUnmounted, ref, watch } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'
import { getSafeAreaTop } from '../../libs/use/useSafeArea'
import { holdTabBar, releaseTabBar } from '../../libs/use/usePopup'
import { useSpinRotation } from '../../libs/use/useSpinRotation'
import { normalizeVideoUrl, prepareVideoSource } from '../../libs/platform'
import type { EmVideoSourceTask } from '../../libs/platform'
import { createLogger } from '../../libs/utils/logger'

const logger = createLogger('video-preview')

interface Props {
  visible: boolean
  src: string
  poster?: string
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  poster: '',
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const ns = useNamespace('video-preview')
const { t } = useLocale()

const VIDEO_ID = 'em-video-preview-player'
const instance = getCurrentInstance()

// 工具条落在状态栏/刘海下方；视频区只占剩余高度（+8 是 H5/无刘海端的视觉留白）
const barStyle = computed(() => `padding-top: ${getSafeAreaTop() + 8}px;`)

const preparing = ref(false)
const downloadPercent = ref(0)
const failed = ref(false)
const started = ref(false)
// 实际播放地址：App 端是本地临时文件；H5/小程序是归一后的远程 URL
const playSrc = ref('')
const retriedHttps = ref(false)
let sourceTask: EmVideoSourceTask | null = null
let prepareSeq = 0
let preparingUrl = ''

const { spinStyle } = useSpinRotation(preparing)

const loadingText = computed(() => {
  const percent = downloadPercent.value
  return percent > 0 && percent < 100
    ? `${t('message.video.loading')} ${percent}%`
    : t('message.video.loading')
})

// 原生 tabBar 在 App/小程序渲染于页面之上：全屏播放期间收起，关闭/卸载时归还
let tabBarHeld = false

function holdTabBarForPlayback(): void {
  if (tabBarHeld) return
  tabBarHeld = true
  holdTabBar()
}

function releaseTabBarForPlayback(): void {
  if (!tabBarHeld) return
  tabBarHeld = false
  releaseTabBar()
}

function abortPrepare(): void {
  prepareSeq += 1
  preparingUrl = ''
  if (sourceTask != null) {
    sourceTask.abort()
    sourceTask = null
  }
  preparing.value = false
  downloadPercent.value = 0
  started.value = false
}

function startPrepare(): void {
  const url = normalizeVideoUrl(props.src)
  prepareSeq += 1
  const seq = prepareSeq
  if (sourceTask != null) {
    sourceTask.abort()
    sourceTask = null
  }
  preparingUrl = url
  failed.value = false
  retriedHttps.value = false
  started.value = false
  downloadPercent.value = 0
  logger.info('open:', url)
  if (url === '') {
    preparing.value = false
    failed.value = true
    return
  }
  preparing.value = true
  const task = prepareVideoSource(url, (percent) => {
    if (seq === prepareSeq && props.visible) downloadPercent.value = percent
  })
  sourceTask = task
  task.promise.then((local) => {
    if (seq !== prepareSeq || !props.visible) return
    sourceTask = null
    playSrc.value = local
    preparing.value = false
    logger.info('ready:', local)
    kickPlay()
  }).catch((e) => {
    if (seq !== prepareSeq || !props.visible) return
    sourceTask = null
    preparing.value = false
    logger.warn('prepare error:', url, e)
    failed.value = true
  })
}

// 不让原生 autoplay 抢跑：等 video 挂载、事件绑定完成后再显式 play，
// 否则播放事件可能丢失，组件一直把首帧/封面当画面。未收到 @play 时每 500ms 重试。
function kickPlay(attempt = 0): void {
  if (playSrc.value === '' || started.value) return
  setTimeout(() => {
    if (!props.visible || playSrc.value === '' || started.value) return
    try {
      const ctx = uni.createVideoContext(VIDEO_ID, instance?.proxy)
      if (ctx != null) ctx.play()
    } catch (e) {
      logger.warn('createVideoContext/play unavailable:', e)
      return
    }
    if (attempt < 8) kickPlay(attempt + 1)
  }, 500)
}

// 可见性与地址合并成一个 watcher：宿主同时改 src + visible 时只准备一次
watch([() => props.visible, () => props.src], ([visible, src]) => {
  if (!visible) {
    abortPrepare()
    releaseTabBarForPlayback()
    return
  }
  holdTabBarForPlayback()
  if (!preparing.value || preparingUrl !== normalizeVideoUrl(src)) {
    startPrepare()
  }
}, { immediate: true })

onUnmounted(() => {
  abortPrepare()
  releaseTabBarForPlayback()
})

function onClose(): void {
  abortPrepare()
  emit('update:visible', false)
}

function onPlay(): void {
  started.value = true
  failed.value = false
}

function onError(e: unknown): void {
  logger.warn('play error:', playSrc.value, e)
  // 非 iOS 端若首次拿到 http 地址（混合内容/域名限制），自动切 https 再试一次
  if (!retriedHttps.value && playSrc.value.indexOf('http://') === 0) {
    retriedHttps.value = true
    playSrc.value = `https://${playSrc.value.slice(7)}`
    failed.value = false
    logger.info('retry with https:', playSrc.value)
    kickPlay()
    return
  }
  failed.value = true
}
</script>

<style>
@import './em-video-preview.css';
</style>
