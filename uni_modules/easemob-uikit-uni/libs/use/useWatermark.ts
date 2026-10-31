import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { EmWatermarkOptions } from '../types'

/** 水印默认值（组件与页面共用同一口径，避免两处漂移） */
const DEFAULT_FONT_SIZE = 12
const DEFAULT_OPACITY = 0.08
const DEFAULT_ROTATE = -20
const DEFAULT_COLOR = 'var(--em-text-primary)'

export type WatermarkValue = string | EmWatermarkOptions

export interface UseWatermarkOptions {
  /** 页面 watermark prop 的取值函数（保持响应式：`() => props.watermark`） */
  watermark: () => WatermarkValue | undefined
  /** #watermark 插槽是否存在（useSlots() 结果，实例级常量，无需响应式） */
  hasSlot: boolean
}

export interface UseWatermarkResult {
  /** 是否挂载覆盖层壳：插槽存在或传了 prop（实例级常量，运行期不增删壳节点） */
  hasWatermark: boolean
  text: ComputedRef<string>
  fontSize: ComputedRef<number>
  opacity: ComputedRef<number>
  rotate: ComputedRef<number>
  color: ComputedRef<string>
}

/**
 * 页面级水印归一（M2.27）：把 `watermark?: string | EmWatermarkOptions` 与插槽存在性
 * 归一成 em-watermark 需要的扁平参数。
 *
 * - `hasWatermark` 是实例级常量：壳节点不随运行期开关增删（蒸汽端新分支可能整批不建，坑集 §5q）；
 * - 运行期开关用空文案（`text=''` → em-watermark 内联 display:none），不要切 v-if；
 * - 插槽存在时页面渲染宿主内容，em-watermark 仅作缺省回落。
 */
export function useWatermark(options: UseWatermarkOptions): UseWatermarkResult {
  const normalized = computed<EmWatermarkOptions | null>(() => {
    const value = options.watermark()
    if (typeof value === 'string') return value === '' ? null : { text: value }
    return value != null && typeof value === 'object' ? value : null
  })

  return {
    hasWatermark: options.hasSlot || options.watermark() !== undefined,
    text: computed(() => normalized.value?.text ?? ''),
    fontSize: computed(() => normalized.value?.fontSize ?? DEFAULT_FONT_SIZE),
    opacity: computed(() => normalized.value?.opacity ?? DEFAULT_OPACITY),
    rotate: computed(() => normalized.value?.rotate ?? DEFAULT_ROTATE),
    color: computed(() => normalized.value?.color ?? DEFAULT_COLOR)
  }
}
