<template>
  <!-- 置顶消息条（M2.20）：折叠态最新一条预览，多条点击计数下拉展开（对齐 vue 版 pinned-bar）；
       纯呈现组件：rows 预览文本由页面侧预计算，定位/取消置顶/展开全部经事件交回页面 -->
  <view :class="[ns.b(), customClass]" :style="customStyle">
    <!-- 展开态（仅多条可展开）：头部点击收起，列表行点击定位、行尾取消置顶 -->
    <view v-if="expanded && rows.length > 1" :class="ns.e('panel')">
      <view :class="ns.e('panel-head')" @click="emit('toggle-expand', false)">
        <EmIcon name="pin" :size="14" :class="ns.e('head-icon')" />
        <text :class="ns.e('head-text')">{{ t('message.pinned.count', { count: rows.length }) }}</text>
        <EmIcon name="chevron-up" :size="14" :class="ns.e('head-toggle')" />
      </view>
      <scroll-view scroll-y :class="ns.e('panel-scroll')">
        <view
          v-for="row in rows"
          :key="row.id"
          :class="ns.e('row')"
          @click="emit('locate', row.id)"
        >
          <text :class="ns.e('row-text')">{{ row.preview }}</text>
          <view :class="ns.e('row-close')" @click.stop="emit('unpin', row)">
            <EmIcon name="circle-xmark" :size="18" />
          </view>
        </view>
      </scroll-view>
    </view>
    <!-- 折叠态：整行点击定位最新一条；多条时计数文本点击展开；行尾取消置顶当前条 -->
    <view v-else :class="ns.e('bar')" @click="onBarClick">
      <EmIcon name="pin" :size="14" :class="ns.e('bar-icon')" />
      <text :class="ns.e('bar-text')">{{ latestPreview }}</text>
      <text
        v-if="rows.length > 1"
        :class="ns.e('bar-count')"
        @click.stop="emit('toggle-expand', true)"
      >{{ t('message.pinned.count', { count: rows.length }) }}</text>
      <view :class="ns.e('bar-close')" @click.stop="onLatestUnpin">
        <EmIcon name="circle-xmark" :size="18" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmIcon from '../em-icon/em-icon.vue'
import type { EmPinnedRow } from '../../libs/types'
import { useNamespace } from '../../libs/use/useNamespace'
import { useLocale } from '../../libs/use/useLocale'

// props 进、事件出：数据与动作全部交回 em-chat-page（定位/取消置顶走 EmKit，展开态页面持有）
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  /** 置顶行（页面侧预计算预览，pinnedAt 降序：rows[0] 为最新置顶） */
  rows: EmPinnedRow[]
  /** 展开态（多条下拉列表），默认折叠 */
  expanded?: boolean
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'toggle-expand', expanded: boolean): void
  (e: 'locate', messageId: string): void
  (e: 'unpin', row: EmPinnedRow): void
}>()

const ns = useNamespace('pinned-bar')
const { t } = useLocale()

const latest = computed<EmPinnedRow | null>(() => props.rows.length > 0 ? props.rows[0] : null)
const latestPreview = computed(() => latest.value?.preview ?? '')

// vue 对齐：折叠态整行点击定位当前展示条（最新置顶）
function onBarClick(): void {
  if (latest.value != null) {
    emit('locate', latest.value.id)
  }
}

function onLatestUnpin(): void {
  if (latest.value != null) {
    emit('unpin', latest.value)
  }
}
</script>

<style>
@import './em-pinned-bar.css';
</style>
