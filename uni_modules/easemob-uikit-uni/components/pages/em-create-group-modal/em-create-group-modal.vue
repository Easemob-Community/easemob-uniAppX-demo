<template>
  <em-select-contact
    :items="items"
    :show="show"
    :select-mode="SELECT_CONTACT_MODE.MULTIPLE"
    :submitting="creating"
    :title="t('conversation.menu.createGroup')"
    @update:show="onUpdateShow"
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
            <view :class="ns.e('switch-hit')" @click.stop>
              <EmSwitch v-model="createPublic" />
            </view>
          </view>
          <view :class="ns.e('switch-row')" @click="createAllowInvites = !createAllowInvites">
            <text :class="ns.e('switch-label')">{{ t('group.createAllowInvites') }}</text>
            <view :class="ns.e('switch-hit')" @click.stop>
              <EmSwitch v-model="createAllowInvites" />
            </view>
          </view>
        </block>
      </view>
    </template>
  </em-select-contact>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import EmSelectContact from '../../em-select-contact/em-select-contact.vue'
import EmSwitch from '../../em-switch/em-switch.vue'
import { EmKit } from '../../../libs'
import { GROUP_NAME_MAX_LENGTH, SELECT_CONTACT_MODE } from '../../../libs/constants'
import type { EmSelectContactItem } from '../../../libs/types'
import { useNamespace } from '../../../libs/use/useNamespace'
import { useLocale } from '../../../libs/use/useLocale'

defineOptions({ styleIsolation: 'app-and-page' })

interface Props {
  show: boolean
  items: EmSelectContactItem[]
  showNameInput?: boolean
  showSettings?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showNameInput: false,
  showSettings: false
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'created', groupId: string): void
}>()

const ns = useNamespace('create-group-modal')
const { t } = useLocale()
const createName = ref('')
const createPublic = ref(false)
const createAllowInvites = ref(false)
const creating = ref(false)

watch(() => props.show, (show) => {
  if (!show) return
  createName.value = ''
  createPublic.value = false
  createAllowInvites.value = false
})

function onUpdateShow(value: boolean): void {
  emit('update:show', value)
}

function autoGroupName(userIds: string[]): string {
  const names = userIds.slice(0, 3).map((id) => props.items.find((item) => item.userId === id)?.name ?? id)
  if (userIds.length > 3) names.push('...')
  return names.join('、') || t('group.createDefaultName')
}

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
    EmKit.insertGroupNotice(groupId, t('group.notice.groupCreated'))
    emit('update:show', false)
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
@import './em-create-group-modal.css';
</style>
