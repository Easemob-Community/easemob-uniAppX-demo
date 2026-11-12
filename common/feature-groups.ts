import type { DemoFeatureKeyValue } from './settings-state'
import type { UIKitFeatureKey } from './uikit-feature-state'

export type FeatureActionKey = 'aiStream' | 'exportLogs' | 'sdkCheck' | 'components' | 'states'
export type UIKitChoiceKey = 'inputMode' | 'quickReplyMode' | 'avatarShape' | 'messageStatusPosition' | 'attachmentProvider'

export interface SwitchDef {
	kind: 'switch'
	key: UIKitFeatureKey | keyof DemoFeatureKeyValue
	labelKey: string
	hintKey: string
	source: 'uikit' | 'demo'
}

export interface ChoiceOptionDef {
	value: string
	labelKey: string
}

export interface ChoiceDef {
	kind: 'choice'
	key: UIKitChoiceKey
	labelKey: string
	hintKey: string
	source: 'uikit'
	options: ChoiceOptionDef[]
}

export interface ActionDef {
	kind: 'action'
	key: FeatureActionKey
	labelKey: string
	hintKey: string
}

export type FeatureItemDef = SwitchDef | ChoiceDef | ActionDef

export interface FeatureGroup {
	key: string
	titleKey: string
	subKey: string
	items: FeatureItemDef[]
}

function uikit(key: UIKitFeatureKey, labelKey: string): SwitchDef {
	return { kind: 'switch', key, labelKey, hintKey: `${labelKey}Hint`, source: 'uikit' }
}

function demo(key: keyof DemoFeatureKeyValue, labelKey: string): SwitchDef {
	return { kind: 'switch', key, labelKey, hintKey: `${labelKey}Hint`, source: 'demo' }
}

function choice(key: UIKitChoiceKey, labelKey: string, options: ChoiceOptionDef[]): ChoiceDef {
	return { kind: 'choice', key, labelKey, hintKey: `${labelKey}Hint`, source: 'uikit', options }
}

function action(key: FeatureActionKey, labelKey: string): ActionDef {
	return { kind: 'action', key, labelKey, hintKey: `${labelKey}Hint` }
}

export const FEATURE_GROUPS: FeatureGroup[] = [
	{
		key: 'messaging',
		titleKey: 'demo.features.group.messaging',
		subKey: 'demo.features.group.messagingSub',
		items: [
			uikit('enableTyping', 'demo.settings.features.enableTyping'),
			uikit('enableDraft', 'demo.settings.features.enableDraft'),
			uikit('showReadStatus', 'demo.settings.features.showReadStatus'),
			uikit('enableGroupReadReceipt', 'demo.settings.features.enableGroupReadReceipt'),
			uikit('enableReEdit', 'demo.settings.features.enableReEdit'),
			uikit('enableStreamMessage', 'demo.settings.features.enableStreamMessage'),
			choice('messageStatusPosition', 'demo.settings.features.messageStatusPosition', [
				{ value: 'left', labelKey: 'demo.settings.features.positionLeft' },
				{ value: 'right', labelKey: 'demo.settings.features.positionRight' }
			]),
			demo('messageForward', 'demo.settings.features.messageForward')
		]
	},
	{
		key: 'input',
		titleKey: 'demo.features.group.input',
		subKey: 'demo.features.group.inputSub',
		items: [
			uikit('inputVoice', 'demo.settings.features.inputVoice'),
			uikit('inputEmoji', 'demo.settings.features.inputEmoji'),
			uikit('inputImage', 'demo.settings.features.inputImage'),
			uikit('inputCamera', 'demo.settings.features.inputCamera'),
			uikit('inputVideo', 'demo.settings.features.inputVideo'),
			uikit('inputFile', 'demo.settings.features.inputFile'),
			choice('attachmentProvider', 'demo.settings.features.attachmentProvider', [
				{ value: 'uni', labelKey: 'demo.settings.features.attachmentProviderUni' },
				{ value: 'plugin', labelKey: 'demo.settings.features.attachmentProviderPlugin' }
			]),
			choice('inputMode', 'demo.settings.features.inputMode', [
				{ value: 'default', labelKey: 'demo.settings.features.optionDefault' },
				{ value: 'single', labelKey: 'demo.settings.features.inputSingle' },
				{ value: 'multiline', labelKey: 'demo.settings.features.inputMultiline' }
			]),
			uikit('chatQuickReplies', 'demo.settings.features.quickReplies'),
			choice('quickReplyMode', 'demo.settings.features.quickReplyMode', [
				{ value: 'fill', labelKey: 'demo.settings.features.quickReplyFill' },
				{ value: 'send', labelKey: 'demo.settings.features.quickReplySend' }
			])
		]
	},
	{
		key: 'message',
		titleKey: 'demo.features.group.message',
		subKey: 'demo.features.group.messageSub',
		items: [
			uikit('messageCopy', 'demo.settings.features.messageCopy'),
			uikit('messageQuote', 'demo.settings.features.messageQuote'),
			uikit('messageEdit', 'demo.settings.features.messageEdit'),
			uikit('messagePin', 'demo.settings.features.messagePin'),
			uikit('messageDownload', 'demo.settings.features.messageDownload'),
			uikit('messageRecall', 'demo.settings.features.messageRecall'),
			uikit('messageResend', 'demo.settings.features.messageResend'),
			uikit('messageDelete', 'demo.settings.features.messageDelete')
		]
	},
	{
		key: 'conversation',
		titleKey: 'demo.features.group.conversation',
		subKey: 'demo.features.group.conversationSub',
		items: [
			uikit('conversationPin', 'demo.settings.features.conversationPin'),
			uikit('conversationMute', 'demo.settings.features.conversationMute'),
			uikit('conversationDelete', 'demo.settings.features.conversationDelete'),
			uikit('conversationConnectionBanner', 'demo.settings.features.connectionBanner'),
			uikit('conversationSearch', 'demo.settings.features.conversationSearch'),
			uikit('conversationTabs', 'demo.settings.features.conversationTabs'),
			choice('avatarShape', 'demo.settings.features.conversationAvatarShape', [
				{ value: 'circle', labelKey: 'demo.settings.features.avatarCircle' },
				{ value: 'square', labelKey: 'demo.settings.features.avatarSquare' }
			])
		]
	},
	{
		key: 'chat',
		titleKey: 'demo.features.group.chat',
		subKey: 'demo.features.group.chatSub',
		items: [
			demo('watermark', 'demo.settings.features.watermark'),
			demo('contactCard', 'demo.settings.features.contactCard'),
			uikit('chatConnectionBanner', 'demo.settings.features.connectionBanner'),
			uikit('chatDetailEntry', 'demo.settings.features.chatDetailEntry'),
			uikit('chatMemberCount', 'demo.settings.features.chatMemberCount'),
			uikit('chatAnnouncement', 'demo.settings.features.chatAnnouncement'),
			uikit('chatMention', 'demo.settings.features.chatMention'),
			uikit('chatSenderName', 'demo.settings.features.chatSenderName'),
			uikit('enableGroupNameEdit', 'demo.settings.features.enableGroupNameEdit'),
			choice('avatarShape', 'demo.settings.features.avatarShape', [
				{ value: 'circle', labelKey: 'demo.settings.features.avatarCircle' },
				{ value: 'square', labelKey: 'demo.settings.features.avatarSquare' }
			])
		]
	},
	{
		key: 'contact',
		titleKey: 'demo.features.group.contact',
		subKey: 'demo.features.group.contactSub',
		items: [
			uikit('contactRemark', 'demo.settings.features.contactRemark'),
			uikit('contactDelete', 'demo.settings.features.contactDelete')
		]
	},
	{
		key: 'debug',
		titleKey: 'demo.features.group.debug',
		subKey: 'demo.features.group.debugSub',
		items: [
			uikit('logPayload', 'demo.settings.features.logPayload'),
			action('aiStream', 'demo.settings.features.aiStream'),
			action('exportLogs', 'demo.settings.features.exportLogs'),
			action('sdkCheck', 'demo.settings.features.sdkCheck'),
			action('components', 'demo.settings.features.components'),
			action('states', 'demo.settings.features.states')
		]
	}
]

export function featureGroupOf(key: string): FeatureGroup {
	return FEATURE_GROUPS.find((g) => g.key === key) ?? FEATURE_GROUPS[0]!
}
