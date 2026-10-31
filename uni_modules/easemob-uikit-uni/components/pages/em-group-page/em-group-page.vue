<template>
  <view :class="[ns.b(), themeClass, customClass]" :style="customStyle">
    <!-- primaryColor 内联变量挂内层：蒸汽端同节点 class 变量会顶掉内联变量（坑集 §5k） -->
    <view :class="ns.e('brand-scope')" :style="primaryColorStyle()">
      <!-- 水印 stage：内容区定位上下文（底边即水印下边界，不含弹层）；不加 overflow 以免裁掉组件探出元素 -->
      <view :class="ns.e('stage')">
        <!-- 自绘导航栏（宿主页面需配 navigationStyle:custom / App titleNView:false）：右侧「+」建群 -->
        <em-nav-bar
          :title="title !== '' ? title : t('group.title')"
          action-icon="circle-plus"
          @back="emit('back')"
          @action="onOpenCreate"
        />

        <em-search-bar v-model="keyword" :placeholder="t('group.searchPlaceholder')" />

        <scroll-view :class="ns.e('scroll')" scroll-y @scrolltolower="onScrollToLower">
          <!-- 群同步骨架：条目形态对齐真实群条目（方形头像 + 群名 + 右侧人数，部分群无人数），逐行变宽 -->
          <view v-if="syncing && items.length === 0" :class="ns.e('skeleton')">
            <view v-for="(nameWidth, index) in SKELETON_NAME_WIDTHS" :key="index" :class="ns.e('skeleton-item')">
              <em-skeleton variant="avatar" shape="square" width="48px" height="48px" />
              <view :class="ns.e('skeleton-lines')">
                <em-skeleton :width="nameWidth" height="16px" />
              </view>
              <em-skeleton v-if="SKELETON_COUNT_ROWS[index]" width="28px" height="12px" :class="ns.e('skeleton-count')" />
            </view>
          </view>
          <em-empty
            v-else-if="syncFailed && groupStore.items.length === 0"
            icon="circle-bang"
            :description="t('common.syncFailed')"
          >
            <em-button type="outline" size="medium" pill :text="t('common.retry')" :loading="syncing" :disabled="syncing" @click="syncList(true)" />
          </em-empty>
          <em-empty
            v-else-if="groupStore.loaded && items.length === 0"
            icon="person-double"
            :description="keyword.trim() !== '' ? t('group.noSearchResult') : t('group.empty')"
          />

          <!-- 群条目：头像 + 群名 + 人数 meta（对齐 vue 版 group-item-default 排版） -->
          <view
            v-for="entry in items"
            :key="entry.group.groupId"
            :class="ns.e('item')"
            @click="emit('click-group', entry.group.groupId)"
          >
            <em-avatar :src="entry.avatar" :name="entry.name" :size="48" shape="square" />
            <em-text :text="entry.name" :text-class="ns.e('name')" :text-style="nameTextStyle" :class="ns.e('name-host')" />
            <text v-if="entry.group.memberCount > 0" :class="ns.e('count')">{{ entry.group.memberCount }}</text>
          </view>

          <!-- 触底加载 footer：SDK 本地全量返回，hasMore 恒 false（契约预留，恒不触发加载） -->
          <em-load-more v-if="items.length > 0" :state="loadMoreState" @load="onLoadMore" />
        </scroll-view>

        <!-- 水印覆盖层（#watermark）：铺满 stage、pointer-events:none 穿透、裁切旋转溢出；层级低于库内弹层基准 2000 -->
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

      <!-- 建群弹层（控制器裁定落在本组件内）：em-select-contact multiple + #panel-top 注入群名/开关表单
           （对齐 vue create-group-modal = contact-transfer-modal + panel-top 的移动端形态；
           群名输入框/群设置区默认隐藏，由 showNameInput/showSettings 门控，对齐 vue config 默认 false） -->
      <em-select-contact
        :items="contactItems"
        :show="createVisible"
        :select-mode="SELECT_CONTACT_MODE.MULTIPLE"
        :submitting="creating"
        :title="t('conversation.menu.createGroup')"
        @update:show="createVisible = $event"
        @confirm="onCreateConfirm"
      >
        <template #panel-top>
          <view v-if="showNameInput || showSettings" :class="ns.e('form')">
            <input
              v-if="showNameInput"
              :class="ns.e('name-input')"
              v-model="createName"
              :placeholder="t('group.createNamePlaceholder')"
              :maxlength="GROUP_NAME_MAX_LENGTH"
            />
            <block v-if="showSettings">
              <view :class="ns.e('switch-row')" @click="createPublic = !createPublic">
                <text :class="ns.e('switch-label')">{{ t('group.createPublic') }}</text>
                <view :class="switchClass(createPublic)">
                  <view :class="ns.e('switch-thumb')" />
                </view>
              </view>
              <view :class="ns.e('switch-row')" @click="createAllowInvites = !createAllowInvites">
                <text :class="ns.e('switch-label')">{{ t('group.createAllowInvites') }}</text>
                <view :class="switchClass(createAllowInvites)">
                  <view :class="ns.e('switch-thumb')" />
                </view>
              </view>
            </block>
          </view>
        </template>
      </em-select-contact>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useSlots } from 'vue'
import EmAvatar from '../../em-avatar/em-avatar.vue'
import EmEmpty from '../../em-empty/em-empty.vue'
import EmButton from '../../em-button/em-button.vue'
import EmLoadMore from '../../em-load-more/em-load-more.vue'
import EmNavBar from '../../em-nav-bar/em-nav-bar.vue'
import EmSearchBar from '../../em-search-bar/em-search-bar.vue'
import EmSelectContact from '../../em-select-contact/em-select-contact.vue'
import EmWatermark from '../../em-watermark/em-watermark.vue'
import EmSkeleton from '../../em-skeleton/em-skeleton.vue'
import EmText from '../../em-text/em-text.vue'
import { EmKit } from '../../../libs'
import { CONVERSATION_TYPE, GROUP_NAME_MAX_LENGTH, LOAD_MORE_STATE, SELECT_CONTACT_MODE } from '../../../libs/constants'
import { groupAvatarOf, groupDisplayNameOf, groupStore } from '../../../libs/store/group'
import { contactDisplayNameOf, contactStore } from '../../../libs/store/contact'
import { primaryColorStyle } from '../../../libs/store/config'
import { avatarOf } from '../../../libs/store/user'
import { TEXT_STYLE_NAME } from '../../../libs/style/textStyles'
import type { LoadMoreStateValue } from '../../../libs/constants'
import type { EmGroup, EmSelectContactItem, EmWatermarkOptions } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useTheme } from '../../../libs/use/useTheme'
import { useLocale } from '../../../libs/use/useLocale'
import { useWatermark } from '../../../libs/use/useWatermark'

defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  /** 导航标题覆盖，空串回落 i18n */
  title?: string
  /** 建群面板是否显示群名称输入框（对齐 vue config.showNameInput，默认 false：自动取前 3 名成员昵称当群名） */
  showNameInput?: boolean
  /** 建群面板是否显示群设置区（公开群/允许成员邀请开关，对齐 vue config.showSettings，默认 false） */
  showSettings?: boolean
  /** 组件级水印：字符串=文案；对象=可调样式；不传不渲染；空串=不显示（运行期开关） */
  watermark?: string | EmWatermarkOptions
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showNameInput: false,
  showSettings: false,
  customClass: '',
  customStyle: ''
})

const emit = defineEmits<{
  (e: 'click-group', groupId: string): void
  // 建群成功（库内已 addConversation + 建群系统通知；宿主接线跳聊天页，对齐 vue selectConversation 语义）
  (e: 'created', groupId: string): void
  (e: 'back'): void
}>()

const ns = useNamespace('group-page')
const { themeClass } = useTheme()
const { t } = useLocale()

const nameTextStyle = TEXT_STYLE_NAME

const syncFailed = computed(() => groupStore.syncFailed)
const syncPending = ref(false)
const syncing = computed(() => groupStore.syncing || syncPending.value)
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

async function syncList(manual = false): Promise<void> {
  if (syncPending.value) return
  syncPending.value = true
  try {
    await EmKit.getJoinedGroups()
  } catch (e) {
    if (manual) uni.showToast({ title: t('group.syncRetryUnavailable'), icon: 'none' })
  } finally {
    syncPending.value = false
  }
}

// 群同步骨架：条数与行宽对齐 vue 版 group-list（8 条、35%/65% 两行）
// 骨架行宽预设：群名宽度逐行变化；成员数仅部分行（memberCount > 0 才渲染，对齐真实条目）
const SKELETON_NAME_WIDTHS = ['42%', '56%', '34%', '62%', '48%', '38%', '52%', '30%']
const SKELETON_COUNT_ROWS = [true, true, false, true, false, true, true, false]

interface Entry {
  group: EmGroup
  name: string
  avatar: string
}

// 名称回落链：groupDisplayNameOf（infoByGroupId 响应式回填）> item.name > groupId；
// 群头像缺失走 em-avatar 文字占位（图标纪律禁 svg/png 默认群头像）；
// 搜索：本地过滤群名 / 群 ID（SDK 本地全量，无服务端搜索）
const items = computed<Entry[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return groupStore.items
    .map((group) => {
      const displayName = groupDisplayNameOf(group.groupId)
      const name = displayName !== group.groupId ? displayName : (group.name !== '' ? group.name : group.groupId)
      return { group, name, avatar: groupAvatarOf(group.groupId) }
    })
    .filter((entry) => {
      if (kw === '') return true
      return entry.name.toLowerCase().includes(kw) || entry.group.groupId.toLowerCase().includes(kw)
    })
})

// 触底加载契约预留：joined 群列表为 SDK 本地全量，hasMore 恒 false；
// 后续若接服务端分页，hasMore/loading 双锁在消费方（见 em-load-more 注释）
const hasMore = false
const loadingMore = ref(false)
const loadMoreState = computed<LoadMoreStateValue>(() => {
  if (loadingMore.value) return LOAD_MORE_STATE.LOADING
  return hasMore ? LOAD_MORE_STATE.BUTTON : LOAD_MORE_STATE.NO_MORE
})

function onScrollToLower(): void {
  if (!hasMore || loadingMore.value) return
  onLoadMore()
}

function onLoadMore(): void {
  // 预留：接入分页数据源时在此触发加载并维护 loadingMore/hasMore
}

// 进入页面刷新已加入群列表；失败时无缓存显示重试，有缓存继续展示内存快照。
onMounted(() => {
  syncList()
})

// ===== 建群弹层 =====
const createVisible = ref(false)
const createName = ref('')
const createPublic = ref(false)
const createAllowInvites = ref(false)
const creating = ref(false)

// 选人数据源：联系人展示名走 remark > nickname > userId 回落链（与 em-conversation-page 同口径）
const contactItems = computed<EmSelectContactItem[]>(() =>
  contactStore.items.map((c) => ({
    userId: c.userId,
    name: contactDisplayNameOf(c.userId),
    avatar: c.avatarUrl !== '' ? c.avatarUrl : avatarOf(c.userId)
  }))
)

function switchClass(on: boolean): string {
  return [ns.e('switch'), on ? 'em-group-page__switch--on' : ''].join(' ').trim()
}

function onOpenCreate(): void {
  createName.value = ''
  createPublic.value = false
  createAllowInvites.value = false
  createVisible.value = true
}

// 自动群名（对齐 vue generatedName）：取前 3 名成员昵称「、」拼接，>3 人补「...」，空选兜底「群聊」
function autoGroupName(userIds: string[]): string {
  const names = userIds.slice(0, 3).map((id) => contactDisplayNameOf(id))
  if (userIds.length > 3) names.push('...')
  return names.join('、') || t('group.createDefaultName')
}

// 建群确认：群名 = 输入框值（showNameInput 开启时）或自动群名（对齐 vue finalName 回落链）→
// EmKit.createGroup（成功即 upsert 群 store，列表自动刷新）→ 本地构造群会话（对齐 vue addConversation）→
// 建群系统通知 + 成功 toast + emit created（宿主跳聊天页，对齐 vue selectConversation）；
// confirm 不自动关窗，成功才关（失败保留已选与表单）
async function onCreateConfirm(userIds: string[]): Promise<void> {
  const name = createName.value.trim() !== '' ? createName.value.trim() : autoGroupName(userIds)
  if (creating.value) return
  creating.value = true
  try {
    const groupId = await EmKit.createGroup({
      name,
      members: userIds,
      public: createPublic.value,
      allowInvites: createAllowInvites.value
    })
    EmKit.addConversation(groupId, CONVERSATION_TYPE.GROUP_CHAT)
    // 建群成功系统通知（本地灰条，不发服务端；对齐 vue groupCreated 通知时机）
    EmKit.insertGroupNotice(groupId, t('group.notice.groupCreated'))
    createVisible.value = false
    uni.showToast({ title: t('group.createSuccess'), icon: 'none' })
    emit('created', groupId)
  } catch (e) {
    uni.showToast({ title: t('group.createFailed'), icon: 'none' })
  } finally {
    creating.value = false
  }
}
</script>

<style>
@import './em-group-page.css';
</style>
