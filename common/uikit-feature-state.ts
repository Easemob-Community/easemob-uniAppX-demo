import { ref } from 'vue'
import type { AttachmentProviderMode } from './attachment-provider'
import {
	CHAT_INPUT_MODE,
	CONTACT_MENU_KEY,
	CONVERSATION_MENU_KEY,
	LOG_LEVEL,
	MESSAGE_MENU_KEY,
	setConfig,
	setLogLevel
} from '@/uni_modules/easemob-uikit-uni/libs'
import type {
	ChatInputModeValue,
	ContactMenuKeyValue,
	ConversationMenuKeyValue,
	EmAvatarShape,
	EmInputFeatures,
	EmQuickReply,
	EmQuickReplyMode,
	MessageMenuKeyValue
} from '@/uni_modules/easemob-uikit-uni/libs'

export type DemoInputMode = 'default' | ChatInputModeValue
export type DemoMessageStatusPosition = 'left' | 'right'

export interface UIKitFeatureKeyValue {
	enableTyping: boolean
	enableDraft: boolean
	showReadStatus: boolean
	enableGroupReadReceipt: boolean
	enableStreamMessage: boolean
	enableReEdit: boolean
	enableGroupNameEdit: boolean
	logPayload: boolean
	inputVoice: boolean
	inputEmoji: boolean
	inputImage: boolean
	inputCamera: boolean
	inputVideo: boolean
	inputFile: boolean
	attachmentProvider: AttachmentProviderMode
	inputMode: DemoInputMode
	messageCopy: boolean
	messageQuote: boolean
	messageEdit: boolean
	messagePin: boolean
	messageDownload: boolean
	messageRecall: boolean
	messageResend: boolean
	messageDelete: boolean
	conversationPin: boolean
	conversationMute: boolean
	conversationDelete: boolean
	conversationConnectionBanner: boolean
	conversationSearch: boolean
	conversationTabs: boolean
	chatConnectionBanner: boolean
	chatDetailEntry: boolean
	chatMemberCount: boolean
	chatAnnouncement: boolean
	chatMention: boolean
	chatSenderName: boolean
	chatQuickReplies: boolean
	quickReplyMode: EmQuickReplyMode
	avatarShape: EmAvatarShape
	messageStatusPosition: DemoMessageStatusPosition
	contactRemark: boolean
	contactDelete: boolean
}

export type UIKitFeatureKey = keyof UIKitFeatureKeyValue
export type UIKitFeatureValue = UIKitFeatureKeyValue[UIKitFeatureKey]

const STORAGE_KEY = 'demo_uikit_feature_preferences'

const DEFAULTS: UIKitFeatureKeyValue = {
	enableTyping: true,
	enableDraft: true,
	showReadStatus: false,
	enableGroupReadReceipt: false,
	enableStreamMessage: true,
	enableReEdit: true,
	enableGroupNameEdit: true,
	logPayload: false,
	inputVoice: true,
	inputEmoji: true,
	inputImage: true,
	inputCamera: true,
	inputVideo: true,
	inputFile: true,
	attachmentProvider: 'uni',
	inputMode: 'default',
	messageCopy: true,
	messageQuote: true,
	messageEdit: true,
	messagePin: true,
	messageDownload: true,
	messageRecall: true,
	messageResend: true,
	messageDelete: true,
	conversationPin: true,
	conversationMute: true,
	conversationDelete: true,
	conversationConnectionBanner: true,
	conversationSearch: true,
	conversationTabs: true,
	chatConnectionBanner: true,
	chatDetailEntry: true,
	chatMemberCount: true,
	chatAnnouncement: true,
	chatMention: true,
	chatSenderName: true,
	chatQuickReplies: false,
	quickReplyMode: 'fill',
	avatarShape: 'circle',
	messageStatusPosition: 'left',
	contactRemark: true,
	contactDelete: true
}

function choiceValue<T extends string>(value: unknown, allowed: T[], fallback: T): T {
	return allowed.includes(value as T) ? value as T : fallback
}

function loadPreferences(): UIKitFeatureKeyValue {
	const merged: UIKitFeatureKeyValue = { ...DEFAULTS }
	try {
		const raw = uni.getStorageSync(STORAGE_KEY) as string
		if (raw === '') return merged
		const parsed = JSON.parse(raw) as Record<string, unknown>
		;(Object.keys(DEFAULTS) as UIKitFeatureKey[]).forEach((key) => {
			if (typeof DEFAULTS[key] === 'boolean' && typeof parsed[key] === 'boolean') {
				;(merged as unknown as Record<string, unknown>)[key] = parsed[key]
			}
		})
		merged.inputMode = choiceValue(parsed['inputMode'], ['default', CHAT_INPUT_MODE.SINGLE, CHAT_INPUT_MODE.MULTILINE], DEFAULTS.inputMode)
		merged.attachmentProvider = choiceValue(parsed['attachmentProvider'], ['uni', 'plugin'], DEFAULTS.attachmentProvider)
		merged.quickReplyMode = choiceValue(parsed['quickReplyMode'], ['fill', 'send'], DEFAULTS.quickReplyMode)
		merged.avatarShape = choiceValue(parsed['avatarShape'], ['circle', 'square'], DEFAULTS.avatarShape)
		merged.messageStatusPosition = choiceValue(parsed['messageStatusPosition'], ['left', 'right'], DEFAULTS.messageStatusPosition)
	} catch (e) {}
	return merged
}

export const uikitFeatures = ref<UIKitFeatureKeyValue>(loadPreferences())

export const demoQuickReplies: EmQuickReply[] = [
	{ label: '您好，请问有什么可以帮您？' },
	{ label: '收到，我尽快处理。' },
	{ label: '感谢你的反馈。' }
]

function enabledMessageKeys(state: UIKitFeatureKeyValue): MessageMenuKeyValue[] {
	const keys: MessageMenuKeyValue[] = []
	if (state.messageCopy) keys.push(MESSAGE_MENU_KEY.COPY)
	if (state.messageQuote) keys.push(MESSAGE_MENU_KEY.QUOTE)
	if (state.messageEdit) keys.push(MESSAGE_MENU_KEY.EDIT)
	if (state.messagePin) keys.push(MESSAGE_MENU_KEY.PIN)
	if (state.messageDownload) keys.push(MESSAGE_MENU_KEY.DOWNLOAD)
	if (state.messageRecall) keys.push(MESSAGE_MENU_KEY.RECALL)
	if (state.messageResend) keys.push(MESSAGE_MENU_KEY.RESEND)
	if (state.messageDelete) keys.push(MESSAGE_MENU_KEY.DELETE)
	return keys
}

function enabledConversationKeys(state: UIKitFeatureKeyValue): ConversationMenuKeyValue[] {
	const keys: ConversationMenuKeyValue[] = []
	if (state.conversationPin) keys.push(CONVERSATION_MENU_KEY.PIN)
	if (state.conversationMute) keys.push(CONVERSATION_MENU_KEY.MUTE)
	if (state.conversationDelete) keys.push(CONVERSATION_MENU_KEY.DELETE)
	return keys
}

function enabledContactKeys(state: UIKitFeatureKeyValue): ContactMenuKeyValue[] {
	const keys: ContactMenuKeyValue[] = []
	if (state.contactRemark) keys.push(CONTACT_MENU_KEY.REMARK)
	if (state.contactDelete) keys.push(CONTACT_MENU_KEY.DELETE)
	return keys
}

export function applyUIKitFeatures(): void {
	const state = uikitFeatures.value
	setLogLevel(state.logPayload ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO)
	const inputFeatures: Partial<EmInputFeatures> = {
		voice: state.inputVoice,
		emoji: state.inputEmoji,
		image: state.inputImage,
		camera: state.inputCamera,
		video: state.inputVideo,
		file: state.inputFile,
		inputMode: state.inputMode === 'default' ? undefined : state.inputMode,
		sendOnReturn: true
	}
	setConfig({
		enableTyping: state.enableTyping,
		enableDraft: state.enableDraft,
		showReadStatus: state.showReadStatus,
		enableGroupReadReceipt: state.enableGroupReadReceipt,
		enableStreamMessage: state.enableStreamMessage,
		enableReEdit: state.enableReEdit,
		enableGroupNameEdit: state.enableGroupNameEdit,
		logPayload: state.logPayload,
		inputFeatures,
		messageMenuKeys: enabledMessageKeys(state),
		conversationMenuKeys: enabledConversationKeys(state),
		contactMenuKeys: enabledContactKeys(state),
		messageStatus: { position: state.messageStatusPosition }
	})
}

export function setUIKitFeature(key: UIKitFeatureKey, value: UIKitFeatureValue): void {
	;(uikitFeatures.value as unknown as Record<string, unknown>)[key] = value
	applyUIKitFeatures()
	try {
		uni.setStorageSync(STORAGE_KEY, JSON.stringify(uikitFeatures.value))
	} catch (e) {}
}
