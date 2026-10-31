<template>
  <view v-if="visible" :class="[ns.b(), ns.m(tone), customClass]" :style="customStyle">
    <EmIcon :name="icon" :size="14" :class="ns.e('icon')" />
    <text :class="ns.e('text')">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import type { EmIconName } from '../em-icon/em-icons'
import { CONNECTION_STATUS } from '../../libs/constants'
import { connectionStore } from '../../libs/store/connection'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

// 连接状态条（P1-3 + 网络调优）：重连中/首次连接/断开/被踢/系统离线时在页面顶部给一条提示。
// 只消费 connectionStore，不参业务；宿主可用页面级 showConnectionBanner=false 关闭。
// 系统离线（networkOnline===false）先决显示红色断网提示，不等 SDK 走完重连循环。
interface Props {
  /** 是否允许展示（页面级透传），默认 true */
  show?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  show: true,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('connection-banner')
const { t } = useLocale()

interface BannerState {
  tone: 'warning' | 'error'
  icon: EmIconName
  text: string
}

const state = computed<BannerState | null>(() => {
  const status = connectionStore.status
  if (status === CONNECTION_STATUS.ONLINE || status === CONNECTION_STATUS.IDLE) {
    // 在线/未连接时，系统网络是唯一离线信号源（SDK 事件此时不可信：启动即无网时连接循环可能还没走完）
    if (connectionStore.networkOnline === false) {
      return { tone: 'error', icon: 'circle-bang', text: t('status.networkError') }
    }
    return null
  }
  // CLOSED：被踢/账号失效终态优先按 kickCode 分流，其余按 SDK 断开原因区分 Token 过期/设备超限/普通网络异常
  if (status === CONNECTION_STATUS.CLOSED) {
    // 被踢类断开 SDK 以 reason="error" + 被踢错误码透出，靠 kicked 标记识别，不能落「网络异常」兜底
    if (connectionStore.kicked) {
      switch (connectionStore.kickCode) {
        case 206:
          return { tone: 'error', icon: 'circle-bang', text: t('status.kickedAnotherDevice') }
        case 216:
          return { tone: 'error', icon: 'circle-bang', text: t('status.kickedPasswordChanged') }
        case 214:
          return { tone: 'error', icon: 'circle-bang', text: t('status.kickedDeviceLimit') }
        default:
          return { tone: 'error', icon: 'circle-bang', text: t('status.kickedOffline') }
      }
    }
    const reason = connectionStore.reason
    if (reason === 'token-expired') {
      return { tone: 'error', icon: 'circle-bang', text: t('status.tokenExpired') }
    }
    if (reason === 'limit') {
      return { tone: 'error', icon: 'circle-bang', text: t('status.kickedDeviceLimit') }
    }
    return { tone: 'error', icon: 'circle-bang', text: t('status.networkError') }
  }
  // CONNECTING / RECONNECTING：系统离线先决显示红色断网提示，不等 SDK 走完重连循环
  if (connectionStore.networkOnline === false) {
    return { tone: 'error', icon: 'circle-bang', text: t('status.networkError') }
  }
  if (status === CONNECTION_STATUS.CONNECTING) {
    return { tone: 'warning', icon: 'loading-arc-normal', text: t('status.connecting') }
  }
  return { tone: 'warning', icon: 'loading-arc-normal', text: t('status.reconnecting') }
})

const visible = computed(() => props.show && state.value != null)
const tone = computed(() => state.value?.tone ?? 'warning')
const icon = computed<EmIconName>(() => state.value?.icon ?? 'circle-bang')
const text = computed(() => state.value?.text ?? '')
</script>

<style>
@import './em-connection-banner.css';
</style>
