<template>
  <view :class="[ns.b(), 'em-bubble', embedded && ns.m('embedded'), customClass]" :style="sizeStyle + customStyle" @touchstart="onTouchStart" @click="onPlay" @longpress="onLongpress">
    <image
      v-if="message.thumbUrl !== ''"
      :class="[ns.e('thumb'), embedded && ns.m('thumb-embedded')]"
      :src="message.thumbUrl"
      mode="aspectFill"
    />
    <view v-else :class="ns.e('placeholder')"></view>
    <!-- 发送中：压暗封面 + 居中 loading（对齐 vue video-message），播放入口暂不显示 -->
    <view v-if="isSending" :class="ns.e('sending')">
      <EmIcon name="loading-arc-normal" :size="24" color="#ffffff" />
      <!-- 附件上传进度（SDK onFileUploadProgress 回填）：有百分比才显示 -->
      <text v-if="uploadText !== ''" :class="ns.e('sending-percent')">{{ uploadText }}</text>
    </view>
    <!-- 播放入口全端显示：App/小程序/H5 统一走聊天页的全屏 em-video-preview（原生 video 组件） -->
    <view v-else-if="canPreview" :class="ns.e('overlay')">
      <view :class="ns.e('play')">
        <!-- 播放三角逐项对齐 vue video-message：Icon triangle 20 / 白色（不再用 border 手绘 / videocam 占位） -->
        <EmIcon name="triangle" :size="20" color="#ffffff" />
      </view>
    </view>
    <view v-if="message.duration > 0" :class="ns.e('duration')">
      <text :class="ns.e('duration-text')">{{ durationText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import { MESSAGE_STATUS } from '../../libs/constants'
import type { EmMessageItem } from '../../libs/types'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLongPressClickGuard } from '../../libs/use/useLongPressClickGuard'
import { PLATFORM_CAPABILITIES } from '../../libs/platform'
import { formatVideoDuration } from '../../libs/utils/time'

interface Props {
  message: EmMessageItem
  embedded?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  embedded: false,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const emit = defineEmits<{
  (e: 'preview', message: EmMessageItem): void
  (e: 'long-press', message: EmMessageItem): void
}>()

const ns = useNamespace('video-message')
// H5 长按后仍会补发 click：吞掉长按抬手那一次 click，避免菜单与视频预览同时触发
const { onTouchStart, shouldSkipClick } = useLongPressClickGuard()

// 发送中：封面压暗 + 居中 loading，播放按钮替换（对齐 vue video-message 的 isSending）
const isSending = computed(() => props.message.status === MESSAGE_STATUS.SENDING)

// 附件上传进度（0-100，SDK SendMessageOptions.onFileUploadProgress 回填）：未知/越界不渲染
const uploadText = computed(() => {
  const value = props.message.uploadProgress
  return value != null && value >= 0 && value <= 100 ? `${Math.round(value)}%` : ''
})

// 展示尺寸按宽高比约束在 240 内；无元数据回落 16:9 占位（对齐 vue 版，避免加载后撑高列表）
const MAX_WIDTH = 240
const EMBEDDED_MAX_WIDTH = 216
const MAX_HEIGHT = 240

const sizeStyle = computed(() => {
  const maxWidth = props.embedded ? EMBEDDED_MAX_WIDTH : MAX_WIDTH
  let w = props.message.width
  let h = props.message.height
  if (w <= 0 || h <= 0) {
    return `width: ${maxWidth}px; height: 135px;`
  }
  const scale = Math.min(maxWidth / w, MAX_HEIGHT / h, 1)
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  return `width: ${w}px; height: ${h}px;`
})

const durationText = computed(() => formatVideoDuration(props.message.duration))

// 播放能力按平台显隐（见 platform.ts）：videoPreview 全端 true；保留开关便于后续按端裁剪
const canPreview = PLATFORM_CAPABILITIES.videoPreview

// 点击行为纯 emit 透传（与 em-image-message 对齐）：默认播放/预览逻辑由宿主（em-chat-page 的 preview 监听）实现
function onPlay(): void {
  if (!canPreview) return
  if (shouldSkipClick()) return
  emit('preview', props.message)
}

function onLongpress(): void {
  emit('long-press', props.message)
}
</script>

<style>
@import './em-video-message.css';
</style>
