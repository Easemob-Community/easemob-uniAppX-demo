<template>
  <view :class="[ns.b(), themeClass, customClass]" :style="customStyle">
    <!-- primaryColor 内联变量挂内层：蒸汽端同节点 class 变量会顶掉内联变量（坑集 §5k） -->
    <view :class="ns.e('brand-scope')" :style="primaryColorStyle()">
      <!-- 水印 stage：nav → 列表的定位上下文；底边即页面可视底，覆盖层不越过它 -->
      <view :class="ns.e('stage')">
        <!-- 自绘导航栏（宿主页面需配 navigationStyle:custom / App titleNView:false）：右侧 person/plus 添加好友（对齐 vue address-book header-extra） -->
        <em-nav-bar
          :title="title !== '' ? title : t('contact.title')"
          :show-back="false"
          action-icon="person-plus"
          @action="emit('add')"
        />

        <!-- 搜索只过滤入口项（label/key 命中，对齐 vue 版 address-book home 语义） -->
        <em-search-bar v-model="keyword" :placeholder="t('contact.searchPlaceholder')" />

        <scroll-view :class="ns.e('scroll')" scroll-y>
          <em-contact-nav :entries="entries" @entry-click="onEntryClick" />
          <em-empty
            v-if="entries.length === 0"
            icon="search"
            :description="t('contact.noSearchResult')"
          />
        </scroll-view>

        <!-- 水印覆盖层（#watermark：铺满 nav/搜索/入口列表，pointer-events:none 穿透；层级低于弹层基准 2000） -->
        <view v-if="hasWatermark" :class="ns.e('watermark')">
          <slot name="watermark" :keyword="keyword">
            <em-watermark
              :text="wmText"
              :font-size="wmFontSize"
              :opacity="wmOpacity"
              :rotate="wmRotate"
              :color="wmColor"
            />
          </slot>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import EmContactNav from '../../em-contact-nav/em-contact-nav.vue'
import EmEmpty from '../../em-empty/em-empty.vue'
import EmNavBar from '../../em-nav-bar/em-nav-bar.vue'
import EmSearchBar from '../../em-search-bar/em-search-bar.vue'
import EmWatermark from '../../em-watermark/em-watermark.vue'
import { CONTACT_ENTRY_KEY } from '../../../libs/constants'
import { contactStore, pendingInviteCount } from '../../../libs/store/contact'
import { primaryColorStyle } from '../../../libs/store/config'
import { groupStore } from '../../../libs/store/group'
import type { EmContactNavEntry, EmWatermarkOptions } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useTheme } from '../../../libs/use/useTheme'
import { useLocale } from '../../../libs/use/useLocale'
import { useWatermark } from '../../../libs/use/useWatermark'

// 通讯录入口页（对齐 vue 版 address-book-container home 视图）：
// 四入口顺序 = 好友列表 / 群组 / 新请求 / 黑名单（黑名单为 demo 需要补回的裁剪项，透出 key 由宿主接线路由）；
// 新请求带 pending 计数 + hot 红点；入口无左图标（vue 默认 entry.icon undefined）；
// 好友字母列表已迁至 em-contact-list-page，点击入口原样透出 key 由宿主接线路由
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  /** 导航标题覆盖，空串回落 i18n */
  title?: string
  /** 组件级水印：字符串=文案；对象=可调样式；不传不渲染；空串=不显示（运行期开关） */
  watermark?: string | EmWatermarkOptions
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'entry-click', key: string): void
  (e: 'add'): void
}>()

const ns = useNamespace('contact-page')
const { themeClass } = useTheme()
const { t } = useLocale()

const keyword = ref('')

// 水印（M2.27）：slot 存在性为实例级常量；文案为空串时 em-watermark 自行隐藏，壳节点不增删
const slots = useSlots()
const {
  hasWatermark,
  text: wmText,
  fontSize: wmFontSize,
  opacity: wmOpacity,
  rotate: wmRotate,
  color: wmColor
} = useWatermark({ watermark: () => props.watermark, hasSlot: slots.watermark != null })

const allEntries = computed<EmContactNavEntry[]>(() => {
  const pendingCount = pendingInviteCount()
  return [
    {
      key: CONTACT_ENTRY_KEY.CONTACT,
      label: t('contact.entryContact'),
      count: contactStore.items.length
    },
    {
      key: CONTACT_ENTRY_KEY.GROUP,
      label: t('contact.entryGroup'),
      count: groupStore.items.length
    },
    {
      key: CONTACT_ENTRY_KEY.NOTICE,
      label: t('contact.newRequests'),
      count: pendingCount,
      hot: pendingCount > 0
    },
    {
      key: CONTACT_ENTRY_KEY.BLOCKLIST,
      label: t('contact.entryBlocklist')
    }
  ]
})

// home 搜索语义：label/key 子串命中（大小写不敏感），不过滤好友本体（对齐 vue navEntries 过滤）
const entries = computed<EmContactNavEntry[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (kw === '') return allEntries.value
  return allEntries.value.filter(
    (e) => e.label.toLowerCase().indexOf(kw) >= 0 || e.key.toLowerCase().indexOf(kw) >= 0
  )
})

function onEntryClick(key: string): void {
  emit('entry-click', key)
}
</script>

<style>
@import './em-contact-page.css';
</style>
