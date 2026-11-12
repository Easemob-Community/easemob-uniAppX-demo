<template>
  <view :class="[ns.b(), 'em-bubble', message.self ? 'em-bubble--self' : '', embedded && ns.m('embedded'), customClass]" :style="customStyle" @longpress="onLongpress">
    <!-- 无 @提及（ext.em_at_list 为空/无）走原纯文本渲染；有则按 parseMentions 分片，
         @ 片段套高亮类可点击（对齐 vue 版 text-message 的 msgSegments，链接识别不在一期） -->
    <!-- 流式光标/异常提示必须是「常驻子 text + 内容切换」，不能 v-if 增删：
         鸿蒙蒸汽端在 text 内移除子 text 后，父 text 的字形不再绘制（气泡保留整块高度但全空白，
         M2.13 真机实测）。常驻节点只改文本内容，结构不变，避免触发该渲染缺陷。 -->
    <text v-if="segments.length === 0" :class="[ns.e('text'), message.self ? 'em-text-message__text--self' : '']">{{ message.text }}<text :class="[ns.e('stream-cursor'), message.self && ns.m('stream-cursor-self')]">{{ streamCursorText }}</text><text :class="[ns.e('stream-error'), message.self && ns.m('stream-error-self')]">{{ streamErrorText }}</text><text :class="ns.e('edited')">{{ showEdited ? t('message.edited') : '' }}</text></text>
    <text v-else :class="[ns.e('text'), message.self ? 'em-text-message__text--self' : '']">
      <template v-for="(seg, idx) in segments" :key="idx">
        <text
          v-if="seg.type === 'mention'"
          :class="[ns.e('mention'), message.self && ns.m('mention-self')]"
          @click="onMentionClick(seg)"
        >{{ seg.value }}</text>
        <text v-else>{{ seg.value }}</text>
      </template>
      <!-- 「已编辑」标记必须常驻子 text + 内容切换（同流式光标纪律）：鸿蒙蒸汽端在 text 内增删子 text 会触发父 text 字形整块不绘制 -->
      <text :class="ns.e('edited')">{{ showEdited ? t('message.edited') : '' }}</text>
    </text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MESSAGE_EXT_KEY, MESSAGE_STATUS, STREAM_CURSOR_CHAR, STREAM_MESSAGE_STATUS } from '../../libs/constants'
import type { EmMessageItem, MentionContact } from '../../libs/types'
import { parseMentions } from '../../libs/utils/mention'
import { isPlainTextStream, isStreamActive } from '../../libs/utils/stream'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

interface Props {
  message: EmMessageItem
  /** @名字 → userId 的解析表（父组件按群成员装配，同 em-mention-picker 的 contacts）；
   *  缺省/未命中时 mention-click 回落为 @ 后的原始名字（与 vue 版 seg.userId=name 行为一致） */
  mentionContacts?: MentionContact[]
  embedded?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  mentionContacts: () => [],
  embedded: false,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const emit = defineEmits<{
  (e: 'long-press', message: EmMessageItem): void
  // @ 片段点击：载荷为解析后的 userId（未命中解析表时为原始名字）
  (e: 'mention-click', userId: string): void
}>()

const ns = useNamespace('text-message')
const { t } = useLocale()

// 「已编辑」标记（M2.20）：modifiedInfo 存在即已编辑（含历史拉取），气泡内文本尾部灰字（对齐 vue 版）；
// 撤回墓碑不显示（vue 对齐 isModified 排除 recalled）
const showEdited = computed(() => props.message.modifiedInfo != null && props.message.status !== MESSAGE_STATUS.RECALLED)

/**
 * 流式消息展示态（M2.13）：分片合并由数据层完成，这里只负责展示。
 * 仅内核纯文本流（customType 缺省/'text'）显示打字机光标与异常提示；
 * markdown 等富格式由宿主经 em-chat-page 的 #stream-message 插槽接管，回调本组件时按普通文本兜底。
 */
const streamState = computed(() => props.message.stream)
const isPlainStream = computed(() => isPlainTextStream(streamState.value))
/** 传输中：气泡尾部打字机光标（蒸汽端 5.26 不支持 CSS 动画，静态光标降级） */
const isStreaming = computed(() => isPlainStream.value && isStreamActive(streamState.value?.status))
/** 异常结束：保留已生成内容，尾部追加「内容生成异常」提示 */
const isStreamError = computed(() => isPlainStream.value && streamState.value?.status === STREAM_MESSAGE_STATUS.ERROR)
/**
 * 光标/异常提示走「常驻子 text + 内容切换」（模板里没有 v-if）：鸿蒙蒸汽端删除 text 的子 text 后
 * 父 text 字形整块丢失（气泡高度保留、内容全白），真机实测见 skill em-crossend-pitfalls。
 * 光标字符与异常文案都收在 computed 里，只改文本内容不改节点结构。
 */
const streamCursorText = computed(() => (isStreaming.value ? STREAM_CURSOR_CHAR : ''))
const streamErrorText = computed(() => (isStreamError.value ? t('message.stream.error') : ''))

interface TextSegment {
  type: 'text' | 'mention'
  value: string
  userId: string
}

// 高亮判定数据源：msg.ext[MESSAGE_EXT_KEY.MENTION]（em_at_list userId 数组）；仅展示层分片，不改消息体
const mentionEnabled = computed(() => {
  const raw = props.message.ext[MESSAGE_EXT_KEY.MENTION]
  return Array.isArray(raw) && raw.length > 0
})

function userIdOfMention(name: string): string {
  const hit = props.mentionContacts.find((c) => c.name === name)
  return hit != null ? hit.userId : name
}

const segments = computed<TextSegment[]>(() => {
  const text = props.message.text
  if (!mentionEnabled.value || text === '') {
    return []
  }
  const result: TextSegment[] = []
  let last = 0
  parseMentions(text).forEach((seg) => {
    if (seg.start > last) {
      result.push({ type: 'text', value: text.slice(last, seg.start), userId: '' })
    }
    result.push({ type: 'mention', value: text.slice(seg.start, seg.end), userId: userIdOfMention(seg.name) })
    last = seg.end
  })
  if (last < text.length) {
    result.push({ type: 'text', value: text.slice(last), userId: '' })
  }
  return result
})

function onMentionClick(seg: TextSegment): void {
  emit('mention-click', seg.userId)
}

function onLongpress(): void {
  emit('long-press', props.message)
}
</script>

<style>
@import './em-text-message.css';
</style>
