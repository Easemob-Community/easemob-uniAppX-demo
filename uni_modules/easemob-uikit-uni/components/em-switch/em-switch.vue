<template>
  <view
    :class="[classes, customClass]"
    :style="customStyle"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-disabled="disabled || loading ? 'true' : 'false'"
    :aria-busy="loading ? 'true' : 'false'"
    @click="onClick"
  >
    <view :class="thumbClasses">
      <EmIcon
        v-if="loading"
        name="loading-arc-normal"
        :size="8"
        color="var(--em-primary-color)"
        :custom-style="spinStyle"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import { useNamespace } from '../../libs/use/useNamespace'
import { useSpinRotation } from '../../libs/use/useSpinRotation'

defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  modelValue?: boolean
  size?: 'medium' | 'small'
  disabled?: boolean
  loading?: boolean
  customClass?: string
  customStyle?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  size: 'medium',
  disabled: false,
  loading: false,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

const ns = useNamespace('switch')
const { spinStyle } = useSpinRotation(toRef(props, 'loading'))

const classes = computed(() => [
  ns.b(),
  ns.m(props.size),
  props.modelValue ? ns.is('checked') : '',
  props.disabled ? ns.is('disabled') : '',
  props.loading ? ns.is('loading') : ''
])

const thumbClasses = computed(() => [
  ns.e('thumb'),
  props.modelValue ? ns.is('checked') : '',
  props.size === 'small' ? ns.is('small') : ''
])

function onClick(): void {
  if (props.disabled || props.loading) return
  const next = !props.modelValue
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style>
@import './em-switch.css';
</style>
