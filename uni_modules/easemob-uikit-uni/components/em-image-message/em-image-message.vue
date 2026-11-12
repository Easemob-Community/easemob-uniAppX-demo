<template>
  <view :class="[ns.b(), 'em-bubble', embedded && ns.m('embedded'), customClass]" :style="customStyle" @touchstart="onTouchStart" @click="onPreview" @longpress="onLongpress">
    <image
      :class="[ns.e('image'), embedded && ns.m('image-embedded')]"
      :src="message.thumbUrl !== '' ? message.thumbUrl : message.url"
      mode="aspectFill"
      :style="imageStyle"
    />
    <!-- 发送中蒙层：压暗图片 + 居中 loading，发送完成随 status 翻转自动消失（对齐 vue image-message） -->
    <view v-if="isSending" :class="ns.e('sending')">
      <EmIcon name="loading-arc-normal" :size="24" color="#ffffff" />
      <!-- 附件上传进度（SDK onFileUploadProgress 回填）：有百分比才显示，未知时只显示 loading -->
      <text v-if="uploadText !== ''" :class="ns.e('sending-percent')">{{ uploadText }}</text>
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

const ns = useNamespace('image-message')
// H5 长按后仍会补发 click：吞掉长按抬手那一次 click，避免菜单与图片预览同时触发
const { onTouchStart, shouldSkipClick } = useLongPressClickGuard()

// 发送中：蒙层 + 居中 loading（对齐 vue image-message 的 isSending）
const isSending = computed(() => props.message.status === MESSAGE_STATUS.SENDING)

// 附件上传进度（0-100，SDK SendMessageOptions.onFileUploadProgress 回填）：未知/越界不渲染
const uploadText = computed(() => {
  const value = props.message.uploadProgress
  return value != null && value >= 0 && value <= 100 ? `${Math.round(value)}%` : ''
})

// 气泡图尺寸：按宽高比约束在 120~200px 区间
const imageStyle = computed(() => {
  const maxW = 200
  const maxH = 200
  let w = props.message.width > 0 ? props.message.width : 120
  let h = props.message.height > 0 ? props.message.height : 160
  const scale = Math.min(maxW / w, maxH / h, 1)
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  return `width: ${w}px; height: ${h}px;`
})

function onPreview(): void {
  if (shouldSkipClick()) return
  emit('preview', props.message)
}

function onLongpress(): void {
  emit('long-press', props.message)
}
</script>

<style>
@import './em-image-message.css';
</style>
