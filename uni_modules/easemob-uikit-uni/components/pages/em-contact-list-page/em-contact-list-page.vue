<template>
  <view :class="[ns.b(), themeClass, customClass]" :style="customStyle">
    <!-- primaryColor 内联变量挂内层：蒸汽端同节点 class 变量会顶掉内联变量（坑集 §5k） -->
    <view :class="ns.e('brand-scope')" :style="primaryColorStyle()">
      <!-- 水印 stage：内容区定位上下文（底边即水印下边界，不含弹层）；不加 overflow 以免裁掉组件探出元素 -->
      <view :class="ns.e('stage')">
        <!-- 自绘导航栏（宿主页面需配 navigationStyle:custom / App titleNView:false）；返回动作以 back 事件透出，路由由宿主接线 -->
        <em-nav-bar :title="t('contact.entryContact')" @back="emit('back')" />

        <em-search-bar v-model="keyword" :placeholder="t('contact.searchPlaceholder')" />

        <view :class="ns.e('body')">
          <scroll-view
            :class="ns.e('scroll')"
            scroll-y
            :scroll-into-view="scrollIntoId"
            :scroll-with-animation="scrollAnim"
          >
            <!-- 好友同步骨架：分组头 + 单行名字条目（对齐真实字母分组列表；真实条目仅一行名字），逐行变宽 -->
            <view v-if="syncing && groups.length === 0" :class="ns.e('skeleton')">
              <view
                v-for="(row, index) in SKELETON_ROWS"
                :key="index"
                :class="[ns.e('skeleton-row'), row.kind === 'header' && ns.m('skeleton-row-header')]"
              >
                <view v-if="row.kind === 'header'" :class="ns.e('skeleton-header-bar')" />
                <template v-else>
                  <em-skeleton variant="avatar" shape="circle" width="48px" height="48px" />
                  <view :class="ns.e('skeleton-lines')">
                    <em-skeleton :width="row.width" height="16px" />
                  </view>
                </template>
              </view>
            </view>
            <em-empty
              v-else-if="syncFailed && contactStore.items.length === 0"
              icon="circle-bang"
              :description="t('common.syncFailed')"
            >
              <em-button type="outline" size="medium" pill :text="t('common.retry')" :loading="syncing" :disabled="syncing" @click="syncList" />
            </em-empty>
            <em-empty
              v-else-if="contactStore.loaded && groups.length === 0"
              icon="person-single"
              :description="keyword.trim() !== '' ? t('contact.noSearchResult') : t('contact.empty')"
            />

            <view v-for="group in groups" :key="group.key">
              <!-- 分组锚点 id 供索引条 scroll-into-view 定位 -->
              <view :id="anchorId(group.key)" :class="ns.e('group-header')">
                <text :class="ns.e('group-header-text')">{{ group.key }}</text>
              </view>
              <view
                v-for="c in group.items"
                :key="c.userId"
                :class="ns.e('item')"
                @touchstart="onTouchStart"
                @click="onSelect(c)"
                @longpress="onLongPress(c)"
              >
                <em-avatar :src="avatarOfItem(c)" :name="nameOf(c)" :size="48" />
                <view :class="ns.e('item-body')">
                  <em-text :text="nameOf(c)" :text-class="ns.e('name')" :text-style="nameTextStyle" :class="ns.e('name-host')" />
                </view>
              </view>
            </view>

            <!-- 底部「没有更多了」（对齐 vue 版 contact-list no-more；SDK 本地全量无分页，恒 noMore 态） -->
            <em-load-more v-if="groups.length > 0" :state="LOAD_MORE_STATE.NO_MORE" />
          </scroll-view>

          <em-alphabet-nav
            v-if="groups.length > 0"
            :active-key="activeKey"
            :dim-keys="dimKeys"
            @jump="onJump"
          />
        </view>

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

      <em-action-sheet
        :visible="itemSheetVisible"
        :actions="itemActions"
        :title="activeContact != null ? nameOf(activeContact) : ''"
        @select="onItemAction"
        @update:visible="itemSheetVisible = $event"
      />

      <!-- 好友备注编辑弹层（M2.20，弹层挂页面根）：回填当前备注，空串即清除；
           保存走 EmKit.setContactRemark（域层成功即刷新快照，展示链自动联动），失败 toast 保留弹层 -->
      <em-popup :visible="remarkVisible" position="center" @update:visible="remarkVisible = $event">
        <view :class="ns.e('dialog')">
          <text :class="ns.e('dialog-title')">{{ t('contact.remark') }}</text>
          <input
            :class="ns.e('dialog-input')"
            v-model="remarkInput"
            :placeholder="t('contact.remarkPlaceholder')"
            :disabled="activeContact != null && isRemarkSaving(activeContact.userId)"
          />
          <view :class="ns.e('dialog-actions')">
            <view :class="[ns.e('dialog-btn'), ns.m('dialog-btn-divider')]" @click="closeRemarkDialog">
              <text :class="ns.e('dialog-btn-text')">{{ t('button.cancel') }}</text>
            </view>
            <view :class="ns.e('dialog-btn')" @click="onSaveRemark">
              <text :class="[ns.e('dialog-btn-text'), ns.m('dialog-btn-text-primary')]">{{ activeContact != null && isRemarkSaving(activeContact.userId) ? t('common.loading') : t('button.confirm') }}</text>
            </view>
          </view>
        </view>
      </em-popup>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useSlots, watch } from 'vue'
import EmAlphabetNav from '../../em-alphabet-nav/em-alphabet-nav.vue'
import EmAvatar from '../../em-avatar/em-avatar.vue'
import EmEmpty from '../../em-empty/em-empty.vue'
import EmButton from '../../em-button/em-button.vue'
import EmNavBar from '../../em-nav-bar/em-nav-bar.vue'
import EmActionSheet from '../../em-action-sheet/em-action-sheet.vue'
import EmLoadMore from '../../em-load-more/em-load-more.vue'
import EmSearchBar from '../../em-search-bar/em-search-bar.vue'
import EmSkeleton from '../../em-skeleton/em-skeleton.vue'
import EmPopup from '../../em-popup/em-popup.vue'
import EmWatermark from '../../em-watermark/em-watermark.vue'
import { EmKit } from '../../../libs'
import { ALPHABET_KEYS, CONTACT_MENU_KEY, LOAD_MORE_STATE } from '../../../libs/constants'
import type { ContactMenuKeyValue } from '../../../libs/constants'
import { contactStore } from '../../../libs/store/contact'
import { primaryColorStyle, useConfig } from '../../../libs/store/config'
import { avatarOf, displayNameOf } from '../../../libs/store/user'
import type { EmActionSheetAction, EmContactItem, EmWatermarkOptions } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useTheme } from '../../../libs/use/useTheme'
import { useLocale } from '../../../libs/use/useLocale'
import { useLongPressClickGuard } from '../../../libs/use/useLongPressClickGuard'
import { groupContacts, matchContact } from '../../../libs/utils/pinyin'
import { TEXT_STYLE_NAME } from '../../../libs/style/textStyles'
import { useWatermark } from '../../../libs/use/useWatermark'

// 好友完整列表页（自 em-contact-page 入口化重构平移）：字母分组 + 索引条 + 搜索 + 长按删除
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  /** 条目长按菜单项与顺序（默认 uiConfig.contactMenuKeys 全量：备注/删除好友）；联系人详情/拉黑仍留二期 */
  menuKeys?: ContactMenuKeyValue[]
  /** 首次挂载自动读好友快照，默认 true；宿主可关闭后自行控制同步时机 */
  autoSync?: boolean
  /** 组件级水印：字符串=文案；对象=可调样式；不传不渲染；空串=不显示（运行期开关） */
  watermark?: string | EmWatermarkOptions
  customClass?: string   // 宿主自定义类，追加到根节点 class（H5 与小程序页面级样式生效；跨端覆盖优先 customStyle）
  customStyle?: string   // 宿主自定义内联样式，拼接到根节点 style 末尾（五端生效，var() 可用）
}

const props = withDefaults(defineProps<Props>(), {
  autoSync: true,
  customClass: '',
  customStyle: ''
})

// 名称文字内联样式收口 libs/style/textStyles.ts（小程序样式隔离，须走 text-style；详见 em-text 注释）
const nameTextStyle = TEXT_STYLE_NAME

const emit = defineEmits<{
  (e: 'select', userId: string): void
  (e: 'back'): void
}>()

const ns = useNamespace('contact-list-page')
const { themeClass } = useTheme()
const { t } = useLocale()
const { config } = useConfig()
// 菜单项：props.menuKeys 显式传入优先，缺省回落 uiConfig.contactMenuKeys（运行时 setConfig 可禁用备注入口）
const resolvedMenuKeys = computed<ContactMenuKeyValue[]>(() => props.menuKeys ?? config.contactMenuKeys)
// H5 长按后仍会补发 click：长按删除菜单与点击进会话会同时触发，这里吞掉长按抬手那一次 click
const { onTouchStart, shouldSkipClick } = useLongPressClickGuard()

const syncFailed = computed(() => contactStore.syncFailed)
const syncPending = ref(false)
const syncing = computed(() => contactStore.syncing || syncPending.value)
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

async function syncList(): Promise<void> {
  if (syncPending.value) return
  syncPending.value = true
  try {
    await EmKit.syncContacts()
  } catch (e) {
  } finally {
    syncPending.value = false
  }
}

// 首次挂载自拉好友快照；失败时无缓存显示重试，有缓存继续展示现有联系人。
onMounted(() => {
  if (!props.autoSync || EmKit.state.userId === '') return
  syncList()
})

// 好友同步骨架：条数与行宽对齐 vue 版 contact-list（8 条、35%/65% 两行）
// 骨架行预设：字母分组头与单行名字条目交替（8 条目 + 3 分组头，对齐真实分组列表），名字宽度逐行变化
type ContactSkeletonRow = { kind: 'header' } | { kind: 'item'; width: string }
const SKELETON_ROWS: ContactSkeletonRow[] = [
  { kind: 'header' },
  { kind: 'item', width: '32%' },
  { kind: 'item', width: '46%' },
  { kind: 'header' },
  { kind: 'item', width: '38%' },
  { kind: 'item', width: '55%' },
  { kind: 'item', width: '28%' },
  { kind: 'header' },
  { kind: 'item', width: '44%' },
  { kind: 'item', width: '36%' },
  { kind: 'item', width: '50%' }
]

// 展示名回落链（对齐 vue 版 contact-display）：remark > userStore nickname > userId；
// 名字一次算成 nameByUserId，分组/排序/搜索三处共用同一口径，避免分组函数内反复 find
const nameMap = computed<Record<string, string>>(() => {
  const nameByUserId: Record<string, string> = {}
  contactStore.items.forEach((c) => {
    nameByUserId[c.userId] = c.remark !== '' ? c.remark : displayNameOf(c.userId, c.nickname)
  })
  return nameByUserId
})

function nameOf(c: EmContactItem): string {
  return nameMap.value[c.userId] ?? c.userId
}

function avatarOfItem(c: EmContactItem): string {
  const url = avatarOf(c.userId)
  return url !== '' ? url : c.avatarUrl
}

// 搜索：展示名/userId 原文命中（注入拼音 adapter 后追加拼音/首字母命中，见 utils/pinyin）
const filtered = computed<EmContactItem[]>(() =>
  contactStore.items.filter((c) => matchContact(c, nameOf(c), keyword.value))
)

// 字母分组（A-Z + '#'，空组剔除，组内排序）
const groups = computed(() => groupContacts(filtered.value, (c) => nameOf(c)))

const groupKeys = computed<string[]>(() => groups.value.map((g) => g.key))

// 无分组的字母淡化（索引条 dimEmpty 语义）
const dimKeys = computed<string[]>(() =>
  ALPHABET_KEYS.filter((k) => groupKeys.value.indexOf(k) < 0)
)

// 索引条定位：scroll-into-view + 组头锚点 id；同组连跳需先清空再赋值保证必触发
// （scroll-into-view 值不变不触发，与聊天页滚底 999999/1000000 交替同因）
const scrollIntoId = ref('')
const scrollAnim = ref(false)
const activeKey = ref('')

function anchorId(key: string): string {
  return key === '#' ? 'em-contact-group-hash' : `em-contact-group-${key}`
}

function onJump(key: string, sliding: boolean): void {
  if (groupKeys.value.indexOf(key) < 0) return
  activeKey.value = key
  scrollAnim.value = !sliding
  const id = anchorId(key)
  if (scrollIntoId.value === id) {
    scrollIntoId.value = ''
    nextTick(() => {
      scrollIntoId.value = id
    })
  } else {
    scrollIntoId.value = id
  }
}

// 索引条初始高亮第一组（vue 版分组数据变化兜底高亮首组的同款语义）：
// 好友快照异步就位，watch 到首个分组出现时设一次初值，之后交给索引条交互驱动
watch(groupKeys, (keys) => {
  if (activeKey.value === '' && keys.length > 0) {
    activeKey.value = keys[0]
  }
})

function onSelect(c: EmContactItem): void {
  if (shouldSkipClick()) return
  emit('select', c.userId)
}

// 长按条目：action-sheet 菜单项按 menuKeys props 过滤排序（默认删除好友，CONTACT_MENU_KEY 收口，danger 项）
const itemSheetVisible = ref(false)
const activeContact = ref<EmContactItem | null>(null)
const deletingContactIds = ref<string[]>([])

function isDeletingContact(userId: string): boolean {
  return deletingContactIds.value.indexOf(userId) >= 0
}

const itemActions = computed<EmActionSheetAction[]>(() => {
  const candidates: EmActionSheetAction[] = [
    // 备注（M2.20）：编辑好友备注（空串即清除），保存走 EmKit.setContactRemark（域层成功即刷新快照）
    { key: CONTACT_MENU_KEY.REMARK, text: t('contact.remark'), icon: 'rect-notched-pen' },
    { key: CONTACT_MENU_KEY.DELETE, text: t('contact.delete'), icon: 'trash', danger: true, disabled: activeContact.value != null && isDeletingContact(activeContact.value.userId) }
  ]
  return resolvedMenuKeys.value
    .map((key) => candidates.find((a) => a.key === key))
    .filter((a): a is EmActionSheetAction => a != null)
})

function onLongPress(c: EmContactItem): void {
  activeContact.value = c
  itemSheetVisible.value = true
}

function onItemAction(action: EmActionSheetAction): void {
  const c = activeContact.value
  if (c == null || isDeletingContact(c.userId)) return
  if (action.key === CONTACT_MENU_KEY.REMARK) {
    openRemarkDialog(c)
    return
  }
  if (action.key === CONTACT_MENU_KEY.DELETE) {
    uni.showModal({
      title: '',
      content: t('contact.deleteConfirm'),
      success: (res) => {
        if (!res.confirm || isDeletingContact(c.userId)) return
        deletingContactIds.value.push(c.userId)
        EmKit.deleteContact(c.userId)
          .then(() => {
            uni.showToast({ title: t('contact.deleteSuccess'), icon: 'none' })
          })
          .catch(() => {
            uni.showToast({ title: t('error.unknown'), icon: 'none' })
          })
          .finally(() => {
            deletingContactIds.value = deletingContactIds.value.filter((id) => id !== c.userId)
          })
      }
    })
  }
}

// ========== 好友备注编辑（M2.20）：长按菜单入口，居中弹层（对齐 em-group-field-dialog 范式） ==========
// 无长度上限、无输入校验（空串即清除备注，vue 版同款语义）；域层成功即全量刷新联系人快照，
// 展示链 contactDisplayNameOf（备注 > 昵称 > userId）自动联动；失败 toast 保留弹层供重试
const remarkVisible = ref(false)
const remarkInput = ref('')
const remarkSavingIds = ref<string[]>([])

function isRemarkSaving(userId: string): boolean {
  return remarkSavingIds.value.indexOf(userId) >= 0
}

function openRemarkDialog(c: EmContactItem): void {
  remarkInput.value = c.remark
  remarkVisible.value = true
}

function closeRemarkDialog(): void {
  remarkVisible.value = false
}

function onSaveRemark(): void {
  const c = activeContact.value
  if (c == null || isRemarkSaving(c.userId)) return
  remarkSavingIds.value.push(c.userId)
  EmKit.setContactRemark(c.userId, remarkInput.value)
    .then(() => {
      uni.showToast({ title: t('contact.remarkSaveSuccess'), icon: 'none' })
      closeRemarkDialog()
    })
    .catch(() => {
      uni.showToast({ title: t('contact.remarkSaveFailed'), icon: 'none' })
    })
    .finally(() => {
      remarkSavingIds.value = remarkSavingIds.value.filter((id) => id !== c.userId)
    })
}
</script>

<style>
@import './em-contact-list-page.css';
</style>
