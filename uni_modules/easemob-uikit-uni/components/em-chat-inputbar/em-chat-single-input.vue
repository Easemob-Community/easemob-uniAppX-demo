<template>
  <input
    :class="[ns.b(), disabled && ns.m('disabled')]"
    v-model="text"
    :focus="focus"
    :placeholder="placeholder"
    :disabled="disabled"
    confirm-type="send"
    :adjust-position="false"
    @confirm="emit('submit')"
    @focus="emit('input-focus')"
    @blur="emit('input-blur')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNamespace } from '../../libs/use/useNamespace'

interface Props {
  modelValue: string
  focus?: boolean
  disabled?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  focus: false,
  disabled: false,
  placeholder: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'input-focus'): void
  (e: 'input-blur'): void
}>()

const ns = useNamespace('chat-single-input')
const text = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})
</script>

<style>
@import './em-chat-single-input.css';
</style>
