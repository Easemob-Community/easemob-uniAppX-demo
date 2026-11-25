<template>
  <em-popup
    :visible="visible"
    position="bottom"
    :mask-closable="false"
    :custom-class="customClass"
    :custom-style="customStyle"
    @mask-click="onMaskClick"
  >
    <view :class="ns.b()">
      <view v-if="title !== ''" :class="ns.e('header')">
        <em-text :text="title" :text-class="ns.e('title')" :text-style="titleTextStyle" />
      </view>
      <view :class="ns.e('list')">
        <view
          v-for="action in actions"
          :key="action.key"
          :class="[ns.e('item'), action.disabled === true ? 'em-action-sheet__item--disabled' : '']"
          @click="onSelect(action)"
        >
          <EmIcon
            v-if="hasIcon(action)"
            :name="iconNameOf(action)"
            :size="16"
            :class="[ns.e('icon'), action.danger === true ? 'em-action-sheet__icon--danger' : '']"
          />
          <em-text :text="action.text" :lines="1" :text-class="actionTextClass(action)" :text-style="actionTextStyle(action)" />
        </view>
      </view>
      <view v-if="showCancel" :class="ns.e('gap')"></view>
      <view v-if="showCancel" :class="ns.e('cancel')" @click="onCancel">
        <text :class="ns.e('cancel-text')">{{ t('button.cancel') }}</text>
      </view>
    </view>
  </em-popup>
</template>

<script setup lang="ts">
import EmPopup from '../em-popup/em-popup.vue'
import EmIcon from '../em-icon/em-icon.vue'
import EmText from '../em-text/em-text.vue'
import type { EmIconName } from '../em-icon/em-icons'
import type { EmActionSheetAction } from '../../libs/types'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

interface Props {
  visible: boolean
  actions: EmActionSheetAction[]
  title?: string
  showCancel?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showCancel: true,
  customClass: '',
  customStyle: ''
})

defineOptions({ styleIsolation: 'app-and-page' })

const emit = defineEmits<{
  (e: 'select', action: EmActionSheetAction): void
  (e: 'cancel'): void
  (e: 'update:visible', value: boolean): void
}>()

const ns = useNamespace('action-sheet')
const { t } = useLocale()

// 遮罩关闭路径统一收口在本组件（popup 的 maskClosable 置 false），保证只走一条 cancel 流程
function onMaskClick(): void {
  emit('cancel')
  emit('update:visible', false)
}

function onCancel(): void {
  emit('cancel')
  emit('update:visible', false)
}

function onSelect(action: EmActionSheetAction): void {
  if (action.disabled === true) return
  emit('select', action)
  emit('update:visible', false)
}

function hasIcon(action: EmActionSheetAction): boolean {
  return action.icon != null && action.icon !== ''
}

// 只在 hasIcon 为真时调用；不再回落旧版 more 别名（无 icon 的 action 与 vue 一致，不渲染图标位）
function iconNameOf(action: EmActionSheetAction): EmIconName {
  return action.icon as EmIconName
}

function actionTextClass(action: EmActionSheetAction): string {
  return action.danger === true
    ? 'em-action-sheet__text em-action-sheet__text--danger'
    : 'em-action-sheet__text'
}

// 内联兜底（小程序样式隔离下本组件 wxss 够不到 em-text 内部 text，见 em-text 注释）
const titleTextStyle = 'font-size: var(--em-font-size-13); color: var(--em-text-tertiary);'
function actionTextStyle(action: EmActionSheetAction): string {
  return action.danger === true
    ? 'font-size: var(--em-font-size-16); color: var(--em-danger-color);'
    : 'font-size: var(--em-font-size-16); color: var(--em-text-primary);'
}
</script>

<style>
@import './em-action-sheet.css';
</style>
