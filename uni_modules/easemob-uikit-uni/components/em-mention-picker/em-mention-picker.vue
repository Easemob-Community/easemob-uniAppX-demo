<template>
  <em-popup :visible="show" :custom-class="customClass" :custom-style="customStyle" @update:visible="onPopupVisible">
    <view :class="ns.e('sheet')" :style="sheetStyle">
      <!-- 头部：居中标题 + 右侧关闭（半屏底部弹层形态，对齐 vue 版 mention-picker 的 h5 分支） -->
      <view :class="ns.e('header')">
        <text :class="ns.e('title')">{{ displayTitle }}</text>
        <view :class="ns.e('close')" @click="onClose">
          <EmIcon name="xmark-bold" :size="20" :class="ns.e('close-icon')" />
        </view>
      </view>
      <em-search-bar v-model="searchText" :placeholder="t('mention.searchPlaceholder')" />
      <scroll-view :class="ns.e('list')" scroll-y>
        <view
          v-for="contact in filtered"
          :key="contact.userId"
          :class="ns.e('row')"
          @click="onSelect(contact)"
        >
          <em-avatar :src="contact.avatar ?? ''" :name="contact.name" :size="40" />
          <view :class="ns.e('meta')">
            <em-text :text="contact.name" :text-class="ns.e('name')" :text-style="nameTextStyle" :class="ns.e('name-host')" />
            <!-- 原名副行：展示名（群名片/昵称）与原 ID 不同才显示（对齐 vue 版 remark/name 双行） -->
            <em-text
              v-if="contact.userId !== contact.name"
              :text="contact.userId"
              :text-class="ns.e('subtitle')"
              :text-style="subtitleTextStyle"
              :class="ns.e('subtitle-host')"
            />
          </view>
        </view>
        <em-empty v-if="filtered.length === 0" icon="at" :description="t('mention.noResult')" size="small" />
      </scroll-view>
    </view>
  </em-popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EmAvatar from '../em-avatar/em-avatar.vue'
import EmEmpty from '../em-empty/em-empty.vue'
import EmIcon from '../em-icon/em-icon.vue'
import EmPopup from '../em-popup/em-popup.vue'
import EmSearchBar from '../em-search-bar/em-search-bar.vue'
import EmText from '../em-text/em-text.vue'
import { TEXT_STYLE_NAME, TEXT_STYLE_SUBTITLE } from '../../libs/style/textStyles'
import type { MentionContact } from '../../libs/types'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

// @提及成员选择弹层原子组件（对齐 vue 版 mention-picker 的 h5 分支，去 PC 锚点/键盘导航）：
// 数据 props 进、事件 emits 出，不连 store 不碰路由不碰 SDK；选择后即关闭（select + update:show 双发）
interface Props {
  show: boolean                    // 弹层显隐（v-model:show）
  contacts: MentionContact[]       // 候选成员（userId/展示名/avatar 由父组件装配好传入）
  keyword?: string                 // @ 后已输入字符（watch 同步进搜索框，外部变化会覆盖框内文本）
  title?: string                   // 自定义标题，缺省走 i18n mention.title
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  keyword: '',
  title: '',
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'select', contact: MentionContact): void
}>()

defineOptions({ styleIsolation: 'app-and-page' })

const ns = useNamespace('mention-picker')
const { t } = useLocale()

const nameTextStyle = TEXT_STYLE_NAME
const subtitleTextStyle = TEXT_STYLE_SUBTITLE

// 半屏高度：按窗口高 60% 预计算（读取时刻快照，弹层存续期内不响应旋转，同 em-select-contact 口径）
const sheetStyle = `height: ${Math.round(uni.getWindowInfo().windowHeight * 0.6)}px;`

const searchText = ref('')

// 同步外部 keyword（@ 后已输入字符由父组件透传进来）
watch(() => props.keyword, (val) => {
  searchText.value = val
}, { immediate: true })

const displayTitle = computed(() => props.title !== '' ? props.title : t('mention.title'))

// 按展示名 / userId 过滤（对齐 vue 版 name+userId 双字段 includes 匹配）
const filtered = computed<MentionContact[]>(() => {
  const kw = searchText.value.trim().toLowerCase()
  if (kw === '') return props.contacts
  return props.contacts.filter((c) =>
    c.name.toLowerCase().includes(kw) || c.userId.toLowerCase().includes(kw)
  )
})

function onSelect(contact: MentionContact): void {
  emit('select', contact)
  emit('update:show', false)
}

function onClose(): void {
  emit('update:show', false)
}

// 关窗统一重置：× / 选人 / 草稿触发 @ 删除等关窗路径都只是改 show prop，
// 重置挂 watch 才能全覆盖（原先挂在 em-popup 的 update:visible 回调上，仅遮罩点击触发）
watch(() => props.show, (visible) => {
  if (!visible) {
    searchText.value = ''
  }
})

function onPopupVisible(value: boolean): void {
  emit('update:show', value)
}
</script>

<style>
@import './em-mention-picker.css';
</style>
