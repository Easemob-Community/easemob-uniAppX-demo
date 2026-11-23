import type { DemoFeatureKeyValue } from './settings-state'
import type { UIKitFeatureKey } from './uikit-feature-state'

export type FeatureActionKey = 'aiStream' | 'exportLogs' | 'sdkCheck' | 'components' | 'states'

export interface SwitchDef {
	kind: 'switch'
	key: UIKitFeatureKey | keyof DemoFeatureKeyValue
	labelKey: string
	hintKey: string
	source: 'uikit' | 'demo'
}

export interface ActionDef {
	kind: 'action'
	key: FeatureActionKey
	labelKey: string
	hintKey: string
}

export type FeatureItemDef = SwitchDef | ActionDef

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
			uikit('enableStreamMessage', 'demo.settings.features.enableStreamMessage')
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
			uikit('chatQuickReplies', 'demo.settings.features.quickReplies')
		]
	},
	{
		key: 'message',
		titleKey: 'demo.features.group.message',
		subKey: 'demo.features.group.messageSub',
		items: [
			uikit('messageQuote', 'demo.settings.features.messageQuote'),
			uikit('messageEdit', 'demo.settings.features.messageEdit'),
			uikit('messagePin', 'demo.settings.features.messagePin'),
			uikit('messageRecall', 'demo.settings.features.messageRecall'),
			uikit('enableReEdit', 'demo.settings.features.enableReEdit'),
			demo('messageForward', 'demo.settings.features.messageForward')
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
			uikit('conversationSearch', 'demo.settings.features.conversationSearch'),
			uikit('conversationTabs', 'demo.settings.features.conversationTabs')
		]
	},
	{
		key: 'chat',
		titleKey: 'demo.features.group.chat',
		subKey: 'demo.features.group.chatSub',
		items: [
			uikit('chatMemberCount', 'demo.settings.features.chatMemberCount'),
			uikit('chatAnnouncement', 'demo.settings.features.chatAnnouncement'),
			uikit('chatMention', 'demo.settings.features.chatMention'),
			uikit('chatSenderName', 'demo.settings.features.chatSenderName'),
			uikit('enableGroupNameEdit', 'demo.settings.features.enableGroupNameEdit')
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
