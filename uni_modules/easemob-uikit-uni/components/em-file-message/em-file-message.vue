<template>
  <view :class="[ns.b(), 'em-bubble', message.self ? 'em-bubble--self' : '', customClass]" :style="customStyle" @touchstart="onTouchStart" @click="onClick" @longpress="onLongpress">
    <view :class="[ns.e('icon'), iconTypeClass]">
      <EmIcon :name="iconName" :size="20" :class="ns.e('icon-glyph')" />
    </view>
    <view :class="ns.e('info')">
      <em-text :text="fileName" :text-class="nameClass" :text-style="nameStyle" />
      <text v-if="sizeText !== ''" :class="[ns.e('size'), message.self ? 'em-file-message__size--self' : '']">{{ sizeText }}</text>
      <!-- 附件上传进度（SDK onFileUploadProgress 回填）：发送中且有百分比时显示，完成后随状态清空 -->
      <text v-if="uploadText !== ''" :class="[ns.e('progress'), message.self ? 'em-file-message__progress--self' : '']">{{ uploadText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import EmText from '../em-text/em-text.vue'
import type { EmIconName } from '../em-icon/em-icons'
import type { EmMessageItem } from '../../libs/types'
import { MESSAGE_STATUS } from '../../libs/constants'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLongPressClickGuard } from '../../libs/use/useLongPressClickGuard'
import { useLocale } from '../../libs/use/useLocale'
import { PLATFORM_CAPABILITIES } from '../../libs/platform'

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
  (e: 'download', message: EmMessageItem): void
  (e: 'long-press', message: EmMessageItem): void
}>()

const ns = useNamespace('file-message')
const { t } = useLocale()
// H5 长按后仍会补发 click：吞掉长按抬手那一次 click，避免菜单与下载提示同时触发
const { onTouchStart, shouldSkipClick } = useLongPressClickGuard()

const fileName = computed(() => props.message.fileName !== '' ? props.message.fileName : t('message.file'))

// 文字样式经 textClass 透传（宿主只参与布局；info 列已有 flex:1 + overflow:hidden 约束链）
const nameClass = computed(() => props.message.self
  ? 'em-file-message__name em-file-message__name--self'
  : 'em-file-message__name')

// 内联兜底（小程序样式隔离下父组件 wxss 够不到 em-text 内部 text，见 em-text 注释）
const nameStyle = computed(() => props.message.self
  ? 'font-size: var(--em-font-size-15); font-weight: var(--em-font-weight-medium); color: var(--em-bubble-text-self);'
  : 'font-size: var(--em-font-size-15); font-weight: var(--em-font-weight-medium); color: var(--em-bubble-text-other);')

const sizeText = computed(() => {
  const size = props.message.fileSize
  if (size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
})

// 附件上传进度（0-100，SDK SendMessageOptions.onFileUploadProgress 回填）：仅发送中且有百分比时显示
const uploadText = computed(() => {
  if (props.message.status !== MESSAGE_STATUS.SENDING) return ''
  const value = props.message.uploadProgress
  return value != null && value >= 0 && value <= 100 ? `${Math.round(value)}%` : ''
})

// 扩展名归类：与 --em-file-icon-{key} token 一一对应（对齐 vue 版 FILE_TYPE_RULES，一期裁剪类目）
type FileTypeKey = 'pdf' | 'xls' | 'doc' | 'ppt' | 'md' | 'img' | 'video' | 'audio' | 'file'

const fileType = computed<FileTypeKey>(() => {
  const name = fileName.value.toLowerCase()
  if (/\.pdf$/.test(name)) return 'pdf'
  if (/\.(xls|xlsx|csv|et)$/.test(name)) return 'xls'
  if (/\.(doc|docx|txt|rtf|wps)$/.test(name)) return 'doc'
  if (/\.(ppt|pptx|dps)$/.test(name)) return 'ppt'
  if (/\.(md|markdown)$/.test(name)) return 'md'
  if (/\.(jpe?g|png|gif|webp|svg|bmp|ico|heic)$/.test(name)) return 'img'
  if (/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/.test(name)) return 'video'
  if (/\.(mp3|wav|aac|flac|ogg|m4a|wma)$/.test(name)) return 'audio'
  return 'file'
})

// 底色走 class 修饰符（避开内联 var() 在蒸汽端的风险）；
// 字形逐项对齐 vue file-message 的 FILE_TYPE_RULES（doc 类目用根级 doc.svg，其余用 file/*，兜底 file/empty）
const iconTypeClass = computed(() => `em-file-message__icon--${fileType.value}`)

const iconName = computed<EmIconName>(() => {
  const type = fileType.value
  if (type === 'pdf') return 'file-pdf'
  if (type === 'xls') return 'file-xls'
  if (type === 'doc') return 'doc'
  if (type === 'ppt') return 'file-ppt'
  if (type === 'md') return 'file-md'
  if (type === 'img') return 'file-img'
  if (type === 'video') return 'file-video'
  if (type === 'audio') return 'file-audio'
  return 'file-empty'
})

// 点击行为纯 emit 透传：默认下载/打开逻辑由宿主（em-chat-page 的 download 监听）实现。
// 一期全端未接文件打开/下载（platform.fileOpen=false）：直接不发事件、不弹「暂不支持」，
// 文件卡退化为纯展示；后续接入时把 fileOpen 打开并由宿主实现 download 即可。
function onClick(): void {
  if (!PLATFORM_CAPABILITIES.fileOpen) return
  if (shouldSkipClick()) return
  emit('download', props.message)
}

function onLongpress(): void {
  emit('long-press', props.message)
}
</script>

<style>
@import './em-file-message.css';
</style>
