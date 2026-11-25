import { computed, onUnmounted, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ERROR_CODE, PANEL_MIN_HEIGHT } from '../constants'
import { cancelRecord, isRecording, startRecord, stopRecord } from '../platform'
import { errorCodeOf } from '../utils/error'
import type { EmChatComposerPanel, EmChatComposerPanelKind, EmChatComposerTouchEvent } from '../types'
import { getSafeAreaBottom } from './useSafeArea'
import { useKeyboardHeight } from './useKeyboardHeight'
import { useLocale } from './useLocale'

export type { EmChatComposerPanel, EmChatComposerPanelKind, EmChatComposerTouchEvent } from '../types'

// 聊天输入栏行为核心 composable（M2.16 从 em-chat-inputbar 抽取）：
// 键盘避让、键盘↔面板互斥、录音手势状态机、禁用态守卫的单一实现。
// 两个消费方：
// - em-chat-inputbar（默认输入栏，独立使用契约不变）
// - em-chat-page 的 #input-bar 整栏自绘插槽（页面实例化后经插槽 scope 透出状态与动作，
//   宿主自绘栏绑定同一契约即获得全部内置行为，无需重踩键盘/面板/录音的跨端坑）
//
// 布局口径（改动前先读 useKeyboardHeight 文件头）：
// - rootStyle：键盘弹起时 margin-bottom = keyboardLift 顶起（上推口径，iOS/鸿蒙不扣安全区）；
//   无面板时自身承担底部安全区，面板打开时安全区由 panelStyle 承担，避免双重间距
// - panelStyle：面板高度 = max(最近键盘本体高度, PANEL_MIN_HEIGHT)，键盘↔面板互切无跳变；
//   底部 safe-bottom padding（面板口径，iOS/鸿蒙已扣安全区）

/** 底部面板三态 / 可切换面板种类 / 录音手势触摸事件结构统一在 libs/types 定义（此处 re-export 便于消费方单点导入） */

export interface UseChatComposerAvailability {
  voice: boolean
  emoji: boolean
  media: boolean
}

export interface UseChatComposerOptions {
  /** 禁用态（全员禁言等）：guard 拦截新操作，翻转瞬间复位面板/语音/焦点 */
  disabled: Readonly<Ref<boolean>>
  /** 运行期功能可用性；关闭已生效的语音/面板能力时同步退出对应状态 */
  availability?: Readonly<Ref<UseChatComposerAvailability>>
  /** 禁用态下的任何操作尝试统一出口（父组件据此 toast 提示） */
  onDisabledTap: () => void
  /** 录音结果出口（手动松开与 60s 自动停共用；过短/失败内部已 toast，不回调） */
  onVoiceSend: (path: string, duration: number) => void
}

export interface UseChatComposerResult {
  /** 当前面板态（none/emoji/media） */
  panel: Ref<EmChatComposerPanel>
  /** 输入框 :focus 绑定值（开面板/收键盘时主动置 false） */
  inputFocus: Ref<boolean>
  /** 语音模式（按住说话条替换输入框） */
  voiceMode: Ref<boolean>
  /** 录音中（按住未松手） */
  recording: Ref<boolean>
  /** 上滑越过取消阈值（松手将取消本次录音） */
  willCancel: Ref<boolean>
  /** 面板口径键盘高度（useKeyboardHeight 透传） */
  keyboardHeight: Ref<number>
  /** 上推口径键盘高度（自绘栏想自己顶起时用；页面壳已处理则忽略） */
  keyboardLift: Ref<number>
  /** 输入栏根节点内联样式（键盘顶起 / 安全区让位） */
  rootStyle: ComputedRef<string>
  /** 面板内联样式（高度跟随键盘 + safe-bottom padding） */
  panelStyle: ComputedRef<string>
  /** 禁用守卫：禁用态下 emit onDisabledTap 并返回 true（调用方应直接 return） */
  guardDisabled: () => boolean
  /** 开/关指定面板（开面板前收键盘并退出语音模式，键盘/面板/语音输入互斥） */
  togglePanel: (kind: EmChatComposerPanelKind) => void
  /** 收起面板 + 收键盘（聊天区点击等外部收起入口） */
  collapse: () => void
  /** 主动收起软键盘（部分端收起不补发 0 高度事件，先本地清零再调原生） */
  closeKeyboard: () => void
  /** 输入框 focus 事件上报（聚焦即收面板） */
  onInputFocus: () => void
  /** 输入框 blur 事件上报（清零键盘高度兜底） */
  onInputBlur: () => void
  /** 切换语音模式（进入时收面板/焦点；退出时取消进行中的录音） */
  toggleVoiceMode: () => void
  /** 退出语音模式（开面板、禁用翻转等场景；进行中的录音会取消） */
  exitVoiceMode: () => void
  onRecordTouchStart: (e: EmChatComposerTouchEvent) => void
  onRecordTouchMove: (e: EmChatComposerTouchEvent) => void
  onRecordTouchEnd: () => void
  onRecordTouchCancel: () => void
}

export function useChatComposer(options: UseChatComposerOptions): UseChatComposerResult {
  const { t } = useLocale()

  // ========== 键盘/面板互斥（对齐 vue 版 h5-input：none/emoji/media 三态，开面板收键盘，聚焦收面板） ==========

  const panel = ref<EmChatComposerPanel>('none')
  const inputFocus = ref(false)
  // 输入框真实聚焦态：H5 没有键盘高度监听（useKeyboardHeight 在 WEB 不注册），
  // 且部分端键盘已弹起但高度事件未回，收起键盘时需靠它判定是否真要收（见 closeKeyboardIfVisible）
  const focused = ref(false)

  // 禁言翻转瞬间复位面板/语音/焦点（禁用态 guard 只拦新操作，已开的面板/语音模式需主动收）
  watch(options.disabled, (v) => {
    if (v) {
      panel.value = 'none'
      exitVoiceMode()
      inputFocus.value = false
    }
  })

  // 禁用态守卫：任何交互尝试统一走 onDisabledTap（父组件 toast），不改动内部状态
  function guardDisabled(): boolean {
    if (options.disabled.value) {
      options.onDisabledTap()
      return true
    }
    return false
  }

  // 手动避让（对齐 hello-uni-app-x keyboard-adjust 示例）：adjust-position 关系统默认上推后，
  // 输入栏以 margin-bottom = 键盘实际上推高度顶到键盘上方；blur 清零兜底部分端收起不补发 0 高度事件
  // 面板高度 = max(最近键盘本体高度, PANEL_MIN_HEIGHT)：真实键盘高于兜底值时面板跟随键盘
  // （对齐 vue 版 panelHeightVar，键盘↔面板互切无跳变）；键盘未弹过则恒为兜底值。
  // 注意面板用 keyboardHeight（面板口径）、输入栏上推用 keyboardLift（上推口径），两者口径不同
  const { keyboardHeight, keyboardLift, resetKeyboardHeight } = useKeyboardHeight()

  // 面板底部安全区（对齐 vue 版 panel 的 safe-bottom padding）
  const panelStyle = computed(() => {
    const bottom = getSafeAreaBottom()
    const pad = bottom > 0 ? `padding-bottom: ${bottom}px;` : ''
    return `height: ${Math.max(keyboardHeight.value, PANEL_MIN_HEIGHT)}px;${pad}`
  })

  // 无面板时输入栏自身贴底，需让出 Home 指示条安全区；面板打开时安全区由面板承担，避免双重间距。
  // 键盘弹起时：以键盘实际上推高度顶起（键盘区已覆盖安全区，不再叠加安全区 padding）
  const rootStyle = computed(() => {
    if (keyboardLift.value > 0) return `margin-bottom: ${keyboardLift.value}px;`
    if (panel.value !== 'none') return ''
    const bottom = getSafeAreaBottom()
    return bottom > 0 ? `padding-bottom: ${bottom}px;` : ''
  })

  // ========== 收起键盘 / 面板 ==========

  // 键盘是否可能弹起：上推高度 > 0 是直接证据；H5 不监听键盘高度（见 useKeyboardHeight），靠 focused 兜底
  function keyboardMaybeOpen(): boolean {
    return focused.value || keyboardLift.value > 0
  }

  // 收键盘：先主动清零键盘高度（部分端收起后不补发 0 高度事件，口径同 onInputBlur），再调原生收起。
  // uni.hideKeyboard 在 App（含鸿蒙）/H5/微信小程序均实现；H5 实现为 blur 当前 input/DOM 焦点
  function closeKeyboard(): void {
    inputFocus.value = false
    focused.value = false
    resetKeyboardHeight()
    uni.hideKeyboard()
  }

  // 仅在键盘可能弹起时收：面板展开态点工具按钮切换时调用，避免每次开面板都空调一次 hideKeyboard
  function closeKeyboardIfVisible(): void {
    if (!keyboardMaybeOpen()) return
    closeKeyboard()
  }

  // 外部收起（聊天页点击消息区，对齐 vue 版 chat__content 的点击 blur 输入框）：
  // 面板 + 键盘一起收；面板本就收起且键盘未弹起时为空操作
  function collapse(): void {
    panel.value = 'none'
    closeKeyboardIfVisible()
  }

  function togglePanel(kind: EmChatComposerPanelKind): void {
    if (guardDisabled()) return
    const open = panel.value !== kind
    if (open) {
      // 面板与语音输入互斥；进行中的录音按取消处理，不交付旧音频
      exitVoiceMode()
      // 开面板前先收键盘（对齐 vue 版 h5-input：togglePanel 先 blur textarea 再开面板，键盘位与面板位不叠加）
      closeKeyboardIfVisible()
      // 焦点交给面板（收起软键盘）
      inputFocus.value = false
    }
    panel.value = open ? kind : 'none'
  }

  function onInputFocus(): void {
    focused.value = true
    panel.value = 'none'
  }

  function onInputBlur(): void {
    focused.value = false
    resetKeyboardHeight()
  }

  // ========== 语音：按住说话 + 上滑取消（微信手势） ==========

  const voiceMode = ref(false)
  const recording = ref(false)
  const willCancel = ref(false)
  const CANCEL_THRESHOLD = 60
  let recordStartY = 0
  let recordErrorNotified = false

  function toggleVoiceMode(): void {
    if (guardDisabled()) return
    if (voiceMode.value) {
      exitVoiceMode()
    } else {
      voiceMode.value = true
      inputFocus.value = false
      panel.value = 'none'
    }
  }

  function exitVoiceMode(): void {
    if (recording.value) {
      cancelRecord()
      recording.value = false
      willCancel.value = false
    }
    voiceMode.value = false
  }

  watch(() => options.availability?.value, (availability) => {
    if (availability == null) return
    if (!availability.voice) exitVoiceMode()
    if (!availability.emoji && panel.value === 'emoji') panel.value = 'none'
    if (!availability.media && panel.value === 'media') panel.value = 'none'
  }, { deep: true })

  // 录音结果统一出口：手动松开与 60s 自动停止共用（自动停止不再静默丢音频）
  function onRecordResult(res: { path: string, duration: number }): void {
    if (res.path === '' || res.duration < 1) {
      uni.showToast({ title: t('chat.voice.tooShort'), icon: 'none' })
      return
    }
    options.onVoiceSend(res.path, res.duration)
  }

  function onRecordError(): void {
    recording.value = false
    willCancel.value = false
    voiceMode.value = false
    if (recordErrorNotified) return
    recordErrorNotified = true
    uni.showToast({ title: t('chat.voice.recordFailed'), icon: 'none' })
  }

  function onRecordStopError(err: unknown): void {
    if (errorCodeOf(err) === ERROR_CODE.RECORD_CANCELLED) return
    onRecordError()
  }

  function onRecordTouchStart(e: EmChatComposerTouchEvent): void {
    if (guardDisabled()) return
    if (recording.value || isRecording()) return
    recordStartY = e.touches[0].clientY
    willCancel.value = false
    recordErrorNotified = false
    recording.value = true
    try {
      startRecord({
        onError: onRecordError,
        onAutoStop: (res) => {
          // 到达 60s 上限由 SDK 自动停：复位手势态并按正常语音发送
          recording.value = false
          willCancel.value = false
          onRecordResult(res)
        }
      })
    } catch (err) {
      onRecordError()
    }
  }

  function onRecordTouchMove(e: EmChatComposerTouchEvent): void {
    if (!recording.value) return
    willCancel.value = recordStartY - e.touches[0].clientY > CANCEL_THRESHOLD
  }

  function onRecordTouchEnd(): void {
    if (!recording.value) return
    recording.value = false
    if (willCancel.value) {
      willCancel.value = false
      cancelRecord()
      return
    }
    stopRecord().then(onRecordResult).catch(onRecordStopError)
  }

  function onRecordTouchCancel(): void {
    if (!recording.value) return
    recording.value = false
    willCancel.value = false
    cancelRecord()
  }

  onUnmounted(() => {
    if (isRecording()) {
      cancelRecord()
    }
  })

  return {
    panel,
    inputFocus,
    voiceMode,
    recording,
    willCancel,
    keyboardHeight,
    keyboardLift,
    rootStyle,
    panelStyle,
    guardDisabled,
    togglePanel,
    collapse,
    closeKeyboard,
    onInputFocus,
    onInputBlur,
    toggleVoiceMode,
    exitVoiceMode,
    onRecordTouchStart,
    onRecordTouchMove,
    onRecordTouchEnd,
    onRecordTouchCancel
  }
}
