<template>
  <view :class="[ns.b(), customClass]" :style="rootStyle + customStyle">
    <!-- 快捷回复条（M2.12）：常用语胶囊，点选事件交给父组件（填草稿/直接发送）；禁言态自动隐藏 -->
    <em-quick-reply-bar
      v-if="quickReplies.length > 0 && !disabled"
      :items="quickReplies"
      :disabled="submitting"
      @select="onQuickReply"
    />

    <!-- 编辑条（M2.20）：编辑态优先于引用条展示（对齐 vue 版 editing-bar）；
         铅笔图标 + 「编辑消息」+ 原文单行截断 + 关闭（取消编辑退编辑态并清空输入，由父组件处理） -->
    <view v-if="editing != null" :class="ns.e('editbar')">
      <EmIcon name="rect-pencil" :size="14" :class="ns.e('editbar-icon')" />
      <view :class="ns.e('editbar-main')">
        <text :class="ns.e('editbar-title')">{{ t('message.editing') }}</text>
        <text :class="ns.e('editbar-preview')">{{ editing.preview }}</text>
      </view>
      <view :class="ns.e('editbar-close')" @click="emit('edit-close')">
        <EmIcon name="circle-xmark" :size="18" />
      </view>
    </view>

    <!-- 引用条（对齐 vue 版 quote-bar）：无边框无底色，2px 竖杠 + 摘要单行省略 + 18×18 纯图标关闭 -->
    <view v-if="quote != null" :class="ns.e('quotebar')">
      <view :class="ns.e('quotebar-line')"></view>
      <!-- 引用条类型图标：逐项对齐 vue quote-bar（文本类型也带 circle/quote） -->
      <EmIcon :name="quoteIcon" :size="14" :class="ns.e('quotebar-icon')" />
      <em-text :text-class="ns.e('quotebar-text')" :text-style="quotebarTextStyle" :class="ns.e('quotebar-host')">
        <text :class="ns.e('quotebar-sender')">{{ quoteFrom }}</text><text :class="ns.e('quotebar-preview')">{{ quoteSuffix }}</text>
      </em-text>
      <!-- 关闭键对齐 vue quote-bar：circle/xmark 18，不是弹层通用的 xmark/bold -->
      <view :class="ns.e('quotebar-close')" @click="emit('quote-close')">
        <EmIcon name="circle-xmark" :size="18" />
      </view>
    </view>

    <view :class="ns.e('bar')">
      <view v-if="showVoice" :class="[ns.e('tool'), ns.m('tool-first')]" @click="onToggleVoiceMode">
        <EmIcon name="mic" :size="24" :color="voiceMode ? 'var(--em-primary-color)' : 'var(--em-text-primary)'" />
      </view>
      <view
        v-if="voiceMode"
        :class="[ns.e('record'), recording && ns.m('record-active')]"
        @touchstart="onRecordTouchStart"
        @touchmove="onRecordTouchMove"
        @touchend="onRecordTouchEnd"
        @touchcancel="onRecordTouchCancel"
      >
        <text :class="ns.e('record-text')">{{ recording ? t('chat.voice.releaseEnd') : t('chat.voice.holdTalk') }}</text>
      </view>
      <EmChatMultilineInput
        v-else-if="resolvedInputMode === CHAT_INPUT_MODE.MULTILINE"
        v-model="text"
        :focus="inputFocus"
        :placeholder="inputPlaceholder"
        :disabled="disabled"
        :confirm-send="legacyMultilineConfirmSend"
        @update:focus="onInputFocusUpdate"
        @submit="onSend"
        @input-focus="onInputFocus"
        @input-blur="onInputBlur"
      />
      <EmChatSingleInput
        v-else
        v-model="text"
        :focus="inputFocus"
        :placeholder="inputPlaceholder"
        :disabled="disabled"
        @submit="onSend"
        @input-focus="onInputFocus"
        @input-blur="onInputBlur"
      />
      <view v-if="features.emoji" :class="[ns.e('tool'), !showVoice && ns.m('tool-first'), panel === 'emoji' && ns.m('tool-active')]" @click="onToggleEmoji">
        <EmIcon name="circle-face" :size="24" />
      </view>
      <!-- 发送位与「+」互斥同槽（对齐微信手机版：不常驻文字发送按钮，把宽度留给输入区）：
           有可发送草稿 = 纸飞机（品牌色）；草稿为空 =「+」媒体面板入口 -->
      <view
        v-if="hasSendableDraft"
        :class="[ns.e('tool'), !showVoice && !features.emoji && ns.m('tool-first')]"
        @click="onSend"
      >
        <EmIcon name="plane" :size="24" color="var(--em-primary-color)" />
      </view>
      <view
        v-else-if="hasMediaFeatures"
        :class="[ns.e('tool'), !showVoice && !features.emoji && ns.m('tool-first'), panel === 'media' && ns.m('tool-active')]"
        @click="onToggleMedia"
      >
        <EmIcon name="circle-plus" :size="24" />
      </view>
    </view>

    <!-- 底部面板：emoji / 媒体二选一，同高（对齐 vue 版 h5-input 的 panel 互斥形态，占键盘位顶起输入栏） -->
    <view v-if="panel === 'emoji'" :class="ns.e('panel')" :style="panelStyle">
      <slot
        name="emoji-panel"
        :emojis="emojis"
        :disabled="disabled"
        :select-emoji="onEmoji"
        :close-panel="closeEmojiPanel"
        :notify-disabled-tap="notifyDisabledTap"
      >
        <scroll-view scroll-y :class="ns.e('emoji-scroll')">
          <view :class="ns.e('emoji-grid')">
            <view v-for="emoji in emojis" :key="emoji" :class="ns.e('emoji-cell')" @click="onEmoji(emoji)">
              <text :class="ns.e('emoji-char')">{{ emoji }}</text>
            </view>
          </view>
        </scroll-view>
      </slot>
    </view>
    <view v-else-if="panel === 'media'" :class="ns.e('panel')" :style="panelStyle">
      <view :class="ns.e('media-grid')">
        <view v-for="item in mediaItems" :key="item.key" :class="ns.e('media-item')" @click="onMediaItem(item.key)">
          <view :class="ns.e('media-tile')">
            <EmIcon :name="item.icon" :size="26" :class="ns.e('media-tile-icon')" />
          </view>
          <text :class="ns.e('media-label')">{{ item.text }}</text>
        </view>
      </view>
    </view>

    <!-- 常驻挂载，避免蒸汽端录音开始时新建浮层偶发丢渲染 -->
    <view
      :class="[ns.e('record-overlay'), willCancel && ns.m('record-overlay-cancel')]"
      :style="recording ? '' : 'top: 200%;'"
    >
      <view :class="ns.e('record-overlay-icon')">
        <EmIcon name="mic" :size="32" :color="willCancel ? 'var(--em-primary-color)' : 'var(--em-text-primary)'" />
      </view>
      <text :class="[ns.e('record-duration'), willCancel && ns.m('record-duration-cancel')]">{{ recordDuration }}s</text>
      <text :class="ns.e('record-overlay-hint')">{{ willCancel ? t('chat.voice.releaseToCancel') : t('chat.voice.slideUpCancel') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, toRef, watch } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import EmQuickReplyBar from '../em-quick-reply-bar/em-quick-reply-bar.vue'
import EmText from '../em-text/em-text.vue'
import EmChatSingleInput from './em-chat-single-input.vue'
import EmChatMultilineInput from './em-chat-multiline-input.vue'
import type { EmIconName } from '../em-icon/em-icons'
import { CHAT_INPUT_MODE, DEFAULT_EMOJI_LIST, MEDIA_PANEL_KEY } from '../../libs/constants'
import { canPickAttachment } from '../../libs/attachment'
import { useChatComposer } from '../../libs/use/useChatComposer'
import type { EmChatInputMode, EmInputFeatures, EmQuickReply, EmQuoteInfo } from '../../libs/types'
import { quoteIconNameOf, quoteSuffixOf } from '../../libs/utils/quote'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

interface Props {
  modelValue: string
  quote: EmQuoteInfo | null
  /** 编辑态（M2.20）：非空时输入栏上方展示编辑条（优先于引用条），关闭经 edit-close 交回父组件 */
  editing?: { preview: string } | null
  /** 输入栏功能集（chat-page 从 uiConfig 读出传入；原子组件不连 store），默认全开 */
  features?: EmInputFeatures
  /** emoji 面板字符集，默认内置 96（constants DEFAULT_EMOJI_LIST） */
  emojis?: string[]
  /** 禁用态（全员禁言等）：输入/发送/语音/面板全断，交互尝试统一 emit disabled-tap 由父组件提示 */
  disabled?: boolean
  /** 文本/直发快捷回复提交中：拦截重复 send 与快捷回复点选，默认 false */
  submitting?: boolean
  /** placeholder 覆盖（空串回落内置 chat.placeholder 文案；禁用态父组件传入「全员禁言中」等） */
  placeholder?: string
  /** 快捷回复常用语（M2.12；空数组不渲染，禁用态隐藏）；点击仅 emit，填草稿/发送由父组件决定 */
  quickReplies?: EmQuickReply[]
  /** 外部收起信号：数值变化即收起 emoji/媒体面板并隐藏软键盘（聊天页点击消息区时递增）。
   *  面板状态归组件内部，父级不持有，故用递增信号而非 $refs 调组件实例方法——蒸汽端/小程序/H5 行为一致 */
  collapseSignal?: number
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  quote: null,
  editing: null,
  features: () => ({ voice: true, emoji: true, image: true, camera: true, video: true, file: true, sendOnReturn: true }),
  emojis: () => DEFAULT_EMOJI_LIST,
  disabled: false,
  submitting: false,
  placeholder: '',
  quickReplies: () => [],
  collapseSignal: 0,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'quote-close'): void
  // 编辑条关闭（M2.20）：父组件退编辑态并清空输入（vue 对齐 handleCancelEdit）
  (e: 'edit-close'): void
  (e: 'media-select', key: string): void
  (e: 'voice-send', path: string, duration: number): void
  // 草稿尾部新增 @ 字符时触发（uni input 无光标 API，只支持尾部追加触发，与 emoji 同款限制）；
  // 纯增量事件，是否响应（群聊 @ 提及）由父组件门控
  (e: 'mention-trigger'): void
  // 禁用态下的任何操作尝试（点工具/发送/按住说话），父组件据此 toast 提示
  (e: 'disabled-tap'): void
  // 快捷回复点选：父组件按 quickReplyMode 决定填草稿还是直接发送（M2.12）
  (e: 'quick-reply', item: EmQuickReply): void
}>()

const ns = useNamespace('chat-inputbar')

// H5 端录音尚未接 MediaRecorder（platform.startRecord 在 H5 直接抛错），
// 展示麦克风只会得到「按住→不支持→退出语音模式」的坏体验，故 H5 隐藏语音入口；
// 其余端（App/小程序）保持 features.voice 开关语义。
// #ifdef WEB
const VOICE_SUPPORTED = false
// #endif
// #ifndef WEB
const VOICE_SUPPORTED = true
// #endif

// 引用条文字内联兜底（小程序样式隔离，见 em-text 注释）
const quotebarTextStyle = 'font-size: var(--em-font-size-13); color: var(--em-text-secondary);'
const { t } = useLocale()

const showVoice = computed(() => props.features.voice && VOICE_SUPPORTED)

// 发送位显隐：草稿 trim 后非空才显示纸飞机发送键，空草稿仍显示「+」媒体入口。
// 两者同槽互斥，收起态不再常驻文字「发送」按钮——省出的宽度全部给输入框，
// 也避免空草稿时挂一个点了没反应的蓝色发送键（发送语义与 onSend 的空值拦截保持一致）
const hasSendableDraft = computed(() => props.modelValue.trim() !== '')

const text = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v)
})

// @ 触发检测：草稿变长且新值以 @ 结尾（尾部追加形态，含粘贴结尾为 @ 的情况；删除到 @ 结尾不触发）
// 注：em-chat-page 的 #input-bar 整栏自绘时该检测由页面侧承担（watch draft 同款逻辑），
// 本 emit 服务默认输入栏与 inputbar 独立使用场景
watch(() => props.modelValue, (v, old) => {
  if (v.length > (old ?? '').length && v.endsWith('@')) {
    emit('mention-trigger')
  }
})

// ========== 行为核心：键盘避让 / 键盘↔面板互斥 / 录音手势状态机 / 禁用守卫 ==========
// 单一实现在 libs/use/useChatComposer（em-chat-page 的 #input-bar 整栏自绘插槽复用同一 composable）；
// 本组件只保留渲染与草稿/引用条/媒体项展示逻辑，对外 props/emits 契约不变
const {
  panel,
  inputFocus,
  voiceMode,
  recording,
  willCancel,
  rootStyle,
  panelStyle,
  guardDisabled,
  togglePanel,
  collapse,
  onInputFocus,
  onInputBlur,
  toggleVoiceMode: onToggleVoiceMode,
  onRecordTouchStart,
  onRecordTouchMove,
  onRecordTouchEnd,
  onRecordTouchCancel
} = useChatComposer({
  disabled: toRef(props, 'disabled'),
  onDisabledTap: () => emit('disabled-tap'),
  onVoiceSend: (path, duration) => emit('voice-send', path, duration)
})

const recordDuration = ref(0)
const RECORD_TIMER_INTERVAL = 200
let recordStartedAt = 0
let recordTimer: ReturnType<typeof setInterval> | null = null

function stopRecordTimer(): void {
  if (recordTimer == null) return
  clearInterval(recordTimer)
  recordTimer = null
}

watch(recording, (active) => {
  stopRecordTimer()
  if (!active) return
  recordDuration.value = 0
  recordStartedAt = Date.now()
  recordTimer = setInterval(() => {
    recordDuration.value = Math.floor((Date.now() - recordStartedAt) / 1000)
  }, RECORD_TIMER_INTERVAL)
})

onUnmounted(stopRecordTimer)

function onToggleEmoji(): void {
  togglePanel('emoji')
}

function onToggleMedia(): void {
  togglePanel('media')
}

// #ifdef APP-IOS
const LEGACY_MULTILINE_ON_SEND_RETURN = true
// #endif
// #ifndef APP-IOS
const LEGACY_MULTILINE_ON_SEND_RETURN = false
// #endif

const resolvedInputMode = computed<EmChatInputMode>(() => {
  if (props.features.inputMode != null) return props.features.inputMode
  return !props.features.sendOnReturn || LEGACY_MULTILINE_ON_SEND_RETURN
    ? CHAT_INPUT_MODE.MULTILINE
    : CHAT_INPUT_MODE.SINGLE
})
const legacyMultilineConfirmSend = computed(() => props.features.inputMode == null && props.features.sendOnReturn)
const inputPlaceholder = computed(() => props.placeholder !== '' ? props.placeholder : t('chat.placeholder'))

function onInputFocusUpdate(value: boolean): void {
  inputFocus.value = value
}


// 外部收起（聊天页点击消息区递增 collapseSignal）：面板 + 键盘一起收
watch(() => props.collapseSignal, () => {
  collapse()
})

// ========== 引用条显示 ==========

// 引用条展示昵称快照；老数据（无 fromName）回落 userId
const quoteFrom = computed(() => {
  const name = props.quote?.fromName ?? ''
  return name !== '' ? name : (props.quote?.from ?? '')
})
// 引用条展示映射收口 libs/utils/quote.ts（与聊天页引用卡共用纯函数）
const quoteSuffix = computed(() => quoteSuffixOf(props.quote, t))
const quoteIcon = computed<EmIconName>(() => quoteIconNameOf(props.quote?.type))

// ========== 发送 ==========

function onSend(): void {
  if (props.submitting) return
  if (guardDisabled()) return
  if (props.modelValue.trim() === '') return
  panel.value = 'none'
  emit('send')
}

// ========== emoji 面板 ==========

// uni 的 input 跨端拿不到光标位置（selectionStart 是 DOM 概念），一期追加到末尾
function onEmoji(emoji: string): void {
  if (guardDisabled()) return
  emit('update:modelValue', props.modelValue + emoji)
}

function closeEmojiPanel(): void {
  panel.value = 'none'
}

function notifyDisabledTap(): void {
  emit('disabled-tap')
}

// ========== 「+」媒体面板（格子布局，对齐 vue 版 more-grid；语音不进格子，走左侧 mic 切换） ==========

interface MediaItem {
  key: string
  text: string
  icon: EmIconName
  feature: keyof EmInputFeatures
}

// 全部候选按 features 过滤（image/camera/video/file 逐项可关；全开时与现状一致）。
// 候选在 computed 内显式标注 MediaItem[]：经 .filter 后字面量失去 contextual typing，icon 会被放宽成 string
const mediaItems = computed<MediaItem[]>(() => {
  const candidates: MediaItem[] = [
    { key: MEDIA_PANEL_KEY.ALBUM, text: t('chat.media.album'), icon: 'rect-img', feature: 'image' },
    { key: MEDIA_PANEL_KEY.CAMERA, text: t('chat.media.camera'), icon: 'camera', feature: 'camera' },
    { key: MEDIA_PANEL_KEY.VIDEO, text: t('chat.media.video'), icon: 'video', feature: 'video' },
    { key: MEDIA_PANEL_KEY.FILE, text: t('chat.media.file'), icon: 'folder', feature: 'file' }
  ]
  return candidates.filter((item) => {
    if (!props.features[item.feature]) return false
    // 平台能力显隐：内置选择器（H5/小程序）或宿主注入的 App 附件能力二选一；
    // canPickAttachment() 读 reactive provider 状态，注册/注销后「文件」格自动出现/隐藏
    if (item.key === MEDIA_PANEL_KEY.FILE && !canPickAttachment()) return false
    return true
  })
})

// 四个媒体项全关时「+」入口整体隐藏
const hasMediaFeatures = computed(() => mediaItems.value.length > 0)

function onMediaItem(key: string): void {
  panel.value = 'none'
  emit('media-select', key)
}

// 快捷回复点选：提交中/禁用态兜底拦截，其余情况原样上抛（是否发送由父组件 quickReplyMode 决定）
function onQuickReply(item: EmQuickReply): void {
  if (props.submitting) return
  if (guardDisabled()) return
  emit('quick-reply', item)
}
</script>

<style>
@import './em-chat-inputbar.css';
</style>
