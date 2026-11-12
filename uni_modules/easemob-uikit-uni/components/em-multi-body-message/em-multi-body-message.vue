<template>
  <view
    :class="[ns.b(), 'em-bubble', message.self ? 'em-bubble--self' : '', customClass]"
    :style="customStyle"
    @longpress="onLongPress"
  >
    <template v-if="segments.length > 0">
      <view
        v-for="(segment, index) in segments"
        :key="segment.localId"
        :class="[ns.e('segment'), index < segments.length - 1 && ns.m('segment-gap')]"
      >
        <em-text-message
          v-if="segment.type === MESSAGE_TYPE.TEXT"
          :message="segment"
          :mention-contacts="mentionContacts"
          embedded
          @mention-click="onMentionClick"
        />
        <em-image-message
          v-else-if="segment.type === MESSAGE_TYPE.IMAGE"
          :message="segment"
          embedded
          @preview="onPreview"
        />
        <em-audio-message
          v-else-if="segment.type === MESSAGE_TYPE.AUDIO"
          :message="segment"
          embedded
        />
        <em-video-message
          v-else-if="segment.type === MESSAGE_TYPE.VIDEO"
          :message="segment"
          embedded
          @preview="onVideoPreview"
        />
        <em-file-message
          v-else-if="segment.type === MESSAGE_TYPE.FILE"
          :message="segment"
          embedded
          @download="onFileDownload"
        />
        <view v-else-if="segment.type === MESSAGE_TYPE.LOCATION" :class="ns.e('location')">
          <view :class="ns.e('location-icon')">
            <EmIcon name="loc" :size="28" :color="message.self ? 'var(--em-bubble-text-self)' : 'var(--em-primary-color)'" />
          </view>
          <view :class="ns.e('location-info')">
            <em-text
              :text="locationAddress(segment)"
              :lines="2"
              :text-class="ns.e('location-address')"
              :text-style="locationAddressStyle"
              :class="ns.e('location-address-host')"
            />
            <text v-if="locationCoordinates(segment) !== ''" :class="[ns.e('location-coordinates'), message.self && ns.m('location-coordinates-self')]">{{ locationCoordinates(segment) }}</text>
          </view>
        </view>
        <text v-else-if="segment.type === MESSAGE_TYPE.CUSTOM" :class="[ns.e('custom-text'), message.self && ns.m('custom-text-self')]">{{ customText(segment) }}</text>
        <text v-else :class="[ns.e('fallback'), message.self && ns.m('fallback-self')]">{{ t('message.unsupported') }}</text>
      </view>
    </template>
    <text v-else :class="[ns.e('fallback'), message.self && ns.m('fallback-self')]">{{ t('message.multiBody') }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmAudioMessage from '../em-audio-message/em-audio-message.vue'
import EmFileMessage from '../em-file-message/em-file-message.vue'
import EmIcon from '../em-icon/em-icon.vue'
import EmImageMessage from '../em-image-message/em-image-message.vue'
import EmText from '../em-text/em-text.vue'
import EmTextMessage from '../em-text-message/em-text-message.vue'
import EmVideoMessage from '../em-video-message/em-video-message.vue'
import { MESSAGE_TYPE } from '../../libs/constants'
import type { EmMessageItem, MentionContact } from '../../libs/types'
import { useLocale } from '../../libs/use/useLocale'
import { useNamespace } from '../../libs/use/useNamespace'
import { multiBodyVisibleSegmentsOf } from '../../libs/utils/multi-body'

interface Props {
  message: EmMessageItem
  mentionContacts?: MentionContact[]
  customClass?: string
  customStyle?: string
}

const props = withDefaults(defineProps<Props>(), {
  mentionContacts: () => [],
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page', virtualHost: true })

const emit = defineEmits<{
  (e: 'long-press', message: EmMessageItem): void
  (e: 'preview', message: EmMessageItem): void
  (e: 'video-preview', message: EmMessageItem): void
  (e: 'file-download', message: EmMessageItem): void
  (e: 'mention-click', userId: string): void
}>()

const ns = useNamespace('multi-body-message')
const { t } = useLocale()
const segments = computed<EmMessageItem[]>(() => multiBodyVisibleSegmentsOf(props.message.segments ?? []))
const locationAddressStyle = computed(() => `font-family: var(--em-font-family); font-size: var(--em-font-size-13); font-weight: var(--em-font-weight-medium); line-height: 18px; color: var(--em-bubble-text-${props.message.self ? 'self' : 'other'});`)

function onLongPress(): void {
  emit('long-press', props.message)
}

function onPreview(message: EmMessageItem): void {
  emit('preview', message)
}

function onVideoPreview(message: EmMessageItem): void {
  emit('video-preview', message)
}

function onFileDownload(message: EmMessageItem): void {
  emit('file-download', message)
}

function onMentionClick(userId: string): void {
  emit('mention-click', userId)
}

function locationAddress(message: EmMessageItem): string {
  const address = message.address ?? ''
  const buildingName = message.buildingName ?? ''
  return address !== '' ? address : (buildingName !== '' ? buildingName : t('message.location'))
}

function locationCoordinates(message: EmMessageItem): string {
  if (typeof message.latitude !== 'number' || typeof message.longitude !== 'number') return ''
  return `${message.latitude.toFixed(6)}, ${message.longitude.toFixed(6)}`
}

function customText(message: EmMessageItem): string {
  const event = message.customEvent
  if (Object.keys(message.customParams).length > 0) {
    return `${event}: ${JSON.stringify(message.customParams)}`
  }
  return event !== '' ? event : t('message.custom')
}
</script>

<style>
@import './em-multi-body-message.css';
</style>
