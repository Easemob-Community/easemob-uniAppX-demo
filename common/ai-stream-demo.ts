import {
	EmKit,
	MESSAGE_STATUS,
	MESSAGE_TYPE,
	STREAM_CUSTOM_TYPE,
	STREAM_MESSAGE_STATUS,
	conversationStore,
	mergeUserInfo,
	useConfig,
	useLocale
} from '@/uni_modules/easemob-uikit-uni/libs'
import type { ConversationTypeValue, EmMessageItem, EmStreamInfo, StreamMessageStatusValue } from '@/uni_modules/easemob-uikit-uni/libs'

interface PendingAiStreamRequest {
	conversationId: string
	chatType: ConversationTypeValue
}

const AI_ASSISTANT_ID = 'demo_ai_assistant'
const AI_STREAM_CONTENT = `你好，我是 AI 助手。

**这是一个 UIKit 流式消息演示：**

1. 文本会按照分片逐步显示。
2. Markdown 由 Demo 的 stream-message 插槽渲染。
3. 关闭“流式消息”后，本演示会一次性展示完整内容。

你可以返回设置页切换开关，再次运行对比效果。`

let pendingRequest: PendingAiStreamRequest | null = null

function buildAiMessage(conversationId: string, chatType: ConversationTypeValue): EmMessageItem {
	mergeUserInfo({ userId: AI_ASSISTANT_ID, nickname: 'AI 助手', avatarUrl: '' })
	return {
		id: '',
		localId: `demo-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		conversationId,
		chatType,
		type: MESSAGE_TYPE.TEXT,
		text: '',
		url: '',
		thumbUrl: '',
		width: 0,
		height: 0,
		time: Date.now(),
		from: AI_ASSISTANT_ID,
		to: EmKit.state.userId,
		self: false,
		status: MESSAGE_STATUS.SENT,
		quote: null,
		duration: 0,
		fileName: '',
		fileSize: 0,
		ext: {},
		rawType: '',
		customEvent: '',
		customParams: {}
	}
}

function runMockAiStream(conversationId: string, chatType: ConversationTypeValue): () => void {
	const { config } = useConfig()
	const store = EmKit.messages
	if (store.messagesByConversationId[conversationId] == null) {
		store.messagesByConversationId[conversationId] = []
	}
	const message = buildAiMessage(conversationId, chatType)
	if (!config.enableStreamMessage) {
		message.text = AI_STREAM_CONTENT
		store.messagesByConversationId[conversationId].push(message)
		return () => {}
	}
	message.stream = {
		customType: STREAM_CUSTOM_TYPE.MARKDOWN,
		seq: 0,
		status: STREAM_MESSAGE_STATUS.START,
		deltaText: '',
		fullText: '',
		errorType: 0
	}
	const list = store.messagesByConversationId[conversationId]
	list.push(message)
	const stored = list[list.length - 1]
	const chunkSize = 6
	let offset = 0
	let seq = 0
	let fullText = ''

	const timer = setInterval(() => {
		const deltaText = AI_STREAM_CONTENT.slice(offset, offset + chunkSize)
		offset += chunkSize
		fullText += deltaText
		const finished = offset >= AI_STREAM_CONTENT.length
		const status: StreamMessageStatusValue = finished ? STREAM_MESSAGE_STATUS.COMPLETED : STREAM_MESSAGE_STATUS.IN_PROGRESS
		const stream: EmStreamInfo = {
			customType: STREAM_CUSTOM_TYPE.MARKDOWN,
			seq,
			status,
			deltaText,
			fullText,
			errorType: 0
		}
		stored.text = fullText
		stored.stream = stream
		seq += 1
		if (finished) clearInterval(timer)
	}, 60)
	return () => clearInterval(timer)
}

export function openAiStreamDemo(): void {
	const { t } = useLocale()
	const latest = conversationStore.items[0]
	if (latest == null) {
		uni.showToast({ title: t('demo.settings.features.aiStreamEmpty'), icon: 'none' })
		return
	}
	pendingRequest = { conversationId: latest.conversationId, chatType: latest.chatType }
	EmKit.enterConversation(latest.conversationId, latest.chatType).catch(() => {})
	EmKit.loadHistory(latest.conversationId, latest.chatType).catch(() => {})
	uni.navigateTo({ url: `/sub-im/pages/chat/chat?conversationId=${latest.conversationId}&chatType=${latest.chatType}` })
}

export function consumeAiStreamDemo(conversationId: string, chatType: ConversationTypeValue): (() => void) | null {
	if (pendingRequest == null || pendingRequest.conversationId !== conversationId || pendingRequest.chatType !== chatType) return null
	pendingRequest = null
	return runMockAiStream(conversationId, chatType)
}
