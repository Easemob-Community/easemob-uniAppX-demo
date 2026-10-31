<template>
  <view :class="ns.b()" :style="wrapStyle" @click="requestInputFocus">
    <textarea
      :class="[ns.e('input'), disabled && ns.m('disabled')]"
      :style="textareaStyle"
      v-model="text"
      :focus="focus"
      :placeholder="placeholder"
      :disabled="disabled"
      :auto-height="false"
      :confirm-type="confirmSend ? 'send' : 'return'"
      :adjust-position="false"
      :show-confirm-bar="false"
      :disable-default-padding="true"
      @confirm="onConfirm"
      @linechange="onLineChange"
      @focus="onTextareaFocus"
      @blur="onTextareaBlur"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { EmTextareaLineChangeEvent } from '../../libs/types'
import { useNamespace } from '../../libs/use/useNamespace'

interface Props {
  modelValue: string
  focus?: boolean
  disabled?: boolean
  placeholder?: string
  confirmSend?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  focus: false,
  disabled: false,
  placeholder: '',
  confirmSend: false
})

defineOptions({ styleIsolation: 'app-and-page' })

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:focus', value: boolean): void
  (e: 'submit'): void
  (e: 'input-focus'): void
  (e: 'input-blur'): void
}>()

const ns = useNamespace('chat-multiline-input')
const text = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

const MAX_LINES = 5
const LINE_HEIGHT = 19
const WRAP_PAD_Y = 16
const visualLineCount = ref(1)

const textHeight = computed(() => LINE_HEIGHT * Math.min(visualLineCount.value, MAX_LINES))
const wrapStyle = computed(() => `height: ${textHeight.value + WRAP_PAD_Y}px;`)
const textareaStyle = computed(() => `height: ${textHeight.value}px;`)

function onLineChange(e: EmTextareaLineChangeEvent): void {
  const lineCount = e.detail?.lineCount ?? 0
  if (lineCount > 0) visualLineCount.value = lineCount
}

let previousHardLines = 0

watch(() => props.modelValue, (value) => {
  const hardLines = value.split('\n').length
  if (value === '') {
    visualLineCount.value = 1
  } else {
    if (hardLines < previousHardLines) {
      visualLineCount.value = Math.min(visualLineCount.value, hardLines)
    }
    if (hardLines > MAX_LINES && hardLines > visualLineCount.value) {
      visualLineCount.value = hardLines
    }
  }
  previousHardLines = hardLines
}, { immediate: true })

const growFocused = ref(false)

function onTextareaFocus(): void {
  growFocused.value = true
  emit('input-focus')
}

function onTextareaBlur(): void {
  growFocused.value = false
  emit('input-blur')
}

function requestInputFocus(): void {
  if (props.disabled || growFocused.value) return
  emit('update:focus', false)
  nextTick(() => {
    emit('update:focus', true)
  })
}

function onConfirm(): void {
  if (props.confirmSend) emit('submit')
}
</script>

<style>
@import './em-chat-multiline-input.css';
</style>
