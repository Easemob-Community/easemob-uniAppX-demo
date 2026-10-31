<template>
  <view :class="ns.b()">
    <!-- 群名称编辑弹层（乐观更新，失败回滚；保存中禁止关闭） -->
    <em-popup :visible="nameEditShow" position="center" @update:visible="onNameVisibleChange">
      <view :class="ns.e('dialog')">
        <text :class="ns.e('dialog-title')">{{ t('group.name') }}</text>
        <input
          :class="ns.e('dialog-input')"
          v-model="nameInput"
          :maxlength="GROUP_NAME_MAX_LENGTH"
          :placeholder="t('group.createNamePlaceholder')"
          :disabled="savingName"
        />
        <view :class="ns.e('dialog-actions')">
          <view :class="[ns.e('dialog-btn'), ns.m('dialog-btn-divider')]" @click="onCancelName">
            <text :class="ns.e('dialog-btn-text')">{{ t('button.cancel') }}</text>
          </view>
          <view :class="ns.e('dialog-btn')" @click="onSaveName">
            <text :class="[ns.e('dialog-btn-text'), ns.m('dialog-btn-text-primary')]">{{ savingName ? t('common.loading') : t('button.confirm') }}</text>
          </view>
        </view>
      </view>
    </em-popup>

    <!-- 群公告弹层：查看态（owner/admin 可切编辑态）/ 编辑态（textarea + 字数计数 x/512） -->
    <em-popup :visible="announcementShow" position="center" @update:visible="onAnnouncementVisibleChange">
      <view :class="ns.e('dialog')">
        <text :class="ns.e('dialog-title')">{{ t('group.announcement') }}</text>
        <template v-if="!announcementEditing">
          <scroll-view :class="ns.e('dialog-scroll')" scroll-y>
            <text :class="[ns.e('dialog-text'), announcement === '' && ns.m('dialog-text-placeholder')]">{{ announcement !== '' ? announcement : t('group.announcementEmpty') }}</text>
          </scroll-view>
          <view :class="ns.e('dialog-actions')">
            <view :class="[ns.e('dialog-btn'), canEditAnnouncement && ns.m('dialog-btn-divider')]" @click="onCloseAnnouncement">
              <text :class="ns.e('dialog-btn-text')">{{ t('button.close') }}</text>
            </view>
            <view v-if="canEditAnnouncement" :class="ns.e('dialog-btn')" @click="startAnnouncementEdit">
              <text :class="[ns.e('dialog-btn-text'), ns.m('dialog-btn-text-primary')]">{{ t('group.edit') }}</text>
            </view>
          </view>
        </template>
        <template v-else>
          <textarea
            :class="ns.e('dialog-textarea')"
            v-model="announcementInput"
            :maxlength="GROUP_ANNOUNCEMENT_MAX_LENGTH"
            :disabled="savingAnnouncement"
          />
          <view :class="ns.e('dialog-count-row')">
            <text :class="ns.e('dialog-count')">{{ announcementInput.length }}/{{ GROUP_ANNOUNCEMENT_MAX_LENGTH }}</text>
          </view>
          <view :class="ns.e('dialog-actions')">
            <view :class="[ns.e('dialog-btn'), ns.m('dialog-btn-divider')]" @click="onCancelAnnouncementEdit">
              <text :class="ns.e('dialog-btn-text')">{{ t('button.cancel') }}</text>
            </view>
            <view :class="ns.e('dialog-btn')" @click="onSaveAnnouncement">
              <text :class="[ns.e('dialog-btn-text'), ns.m('dialog-btn-text-primary')]">{{ savingAnnouncement ? t('common.loading') : t('button.confirm') }}</text>
            </view>
          </view>
        </template>
      </view>
    </em-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EmPopup from '../../em-popup/em-popup.vue'
import { EmKit } from '../../../libs'
import { GROUP_ANNOUNCEMENT_MAX_LENGTH, GROUP_NAME_MAX_LENGTH } from '../../../libs/constants'
import { groupStore, updateGroup } from '../../../libs/store/group'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useLocale } from '../../../libs/use/useLocale'

// chat-info 群分支字段编辑弹层（页面级内聚拆分）：群名称 + 群公告两个居中弹层。
// 必须渲染在页面根级（scroll-view 之外，全库弹层范式）；显隐经 v-model:nameEditShow /
// v-model:announcementShow 受控；写操作走 EmKit，群名乐观更新失败回滚（对齐免打扰 switch 范式）。
defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  groupId: string
  isOwner: boolean
  isAdmin: boolean
  /** 群名称编辑弹层显隐（v-model:nameEditShow） */
  nameEditShow: boolean
  /** 群公告弹层显隐（v-model:announcementShow） */
  announcementShow: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:nameEditShow', value: boolean): void
  (e: 'update:announcementShow', value: boolean): void
}>()

const ns = useNamespace('group-field-dialog')
const { t } = useLocale()

// ========== 群名称编辑 ==========

const nameInput = ref('')
const savingName = ref(false)

// 打开时回显当前群名（store 响应式，保存成功后重开即新值）
watch(() => props.nameEditShow, (show) => {
  if (show) {
    nameInput.value = groupStore.infoByGroupId[props.groupId]?.name ?? props.groupId
  }
})

function onNameVisibleChange(value: boolean): void {
  if (!value && savingName.value) return
  emit('update:nameEditShow', value)
}

function onCancelName(): void {
  onNameVisibleChange(false)
}

// 乐观更新：先写 store，失败回滚（domain updateGroupInfo 成功路径也会写 store，幂等）
async function onSaveName(): Promise<void> {
  if (savingName.value) return
  const value = nameInput.value.trim()
  if (value === '') {
    uni.showToast({ title: t('group.createNameRequired'), icon: 'none' })
    return
  }
  const prevName = groupStore.infoByGroupId[props.groupId]?.name
  savingName.value = true
  if (prevName != null) {
    updateGroup(props.groupId, { name: value })
  }
  try {
    await EmKit.updateGroupInfo(props.groupId, { name: value })
    emit('update:nameEditShow', false)
    uni.showToast({ title: t('group.updateSuccess'), icon: 'success' })
  } catch (err) {
    if (prevName != null) {
      updateGroup(props.groupId, { name: prevName })
    }
    uni.showToast({ title: t('group.updateFailed'), icon: 'none' })
  } finally {
    savingName.value = false
  }
}

// ========== 群公告查看/编辑 ==========

const announcement = computed(() => groupStore.announcementByGroupId[props.groupId] ?? '')
const canEditAnnouncement = computed(() => props.isOwner || props.isAdmin)

const announcementEditing = ref(false)
const announcementInput = ref('')
const savingAnnouncement = ref(false)

// 弹层关闭时复位编辑态（下次打开恒为查看态，对齐 vue group-announcement 交互）
watch(() => props.announcementShow, (show) => {
  if (!show) {
    announcementEditing.value = false
  }
})

function onAnnouncementVisibleChange(value: boolean): void {
  if (!value && savingAnnouncement.value) return
  emit('update:announcementShow', value)
}

function onCloseAnnouncement(): void {
  onAnnouncementVisibleChange(false)
}

function onCancelAnnouncementEdit(): void {
  if (savingAnnouncement.value) return
  announcementEditing.value = false
}

function startAnnouncementEdit(): void {
  announcementInput.value = announcement.value
  announcementEditing.value = true
}

// 保存走 domain（成功内部回写 announcementByGroupId 缓存），失败保留编辑态
async function onSaveAnnouncement(): Promise<void> {
  if (savingAnnouncement.value) return
  savingAnnouncement.value = true
  try {
    await EmKit.updateGroupAnnouncement(props.groupId, announcementInput.value)
    announcementEditing.value = false
    uni.showToast({ title: t('group.updateSuccess'), icon: 'success' })
  } catch (err) {
    uni.showToast({ title: t('group.updateFailed'), icon: 'none' })
  } finally {
    savingAnnouncement.value = false
  }
}
</script>

<style>
@import './em-group-field-dialog.css';
</style>
