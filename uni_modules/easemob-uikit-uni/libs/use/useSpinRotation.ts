// loading spinner 旋转：蒸汽端（5.26）不跑 CSS @keyframes，动画一律 JS 定时器逐帧驱动内联 style
// （同 em-audio-message 波柱 / chat-page 引用定位脉冲口径）。输出可直接绑 EmIcon custom-style 的角度串。

import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'

export interface EmSpinRotation {
  /** 绑到 EmIcon 的 custom-style（customStyle 五端生效） */
  spinStyle: ComputedRef<string>
}

// 30°/步 × 80ms → 一圈 800ms，与 vue 版按钮 loading（uikit-spin 0.8s linear）转速一致
const SPIN_STEP_DEG = 30
const SPIN_INTERVAL_MS = 80

export function useSpinRotation(active: Readonly<Ref<boolean>>): EmSpinRotation {
  const rotateDeg = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (timer != null) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(): void {
    stop()
    timer = setInterval(() => {
      rotateDeg.value = (rotateDeg.value + SPIN_STEP_DEG) % 360
    }, SPIN_INTERVAL_MS)
  }

  watch(
    active,
    (isActive) => {
      if (isActive) {
        start()
      } else {
        stop()
        rotateDeg.value = 0
      }
    },
    { immediate: true }
  )

  onUnmounted(stop)

  const spinStyle = computed(() => `transform: rotate(${rotateDeg.value}deg); transform-origin: center;`)

  return { spinStyle }
}
