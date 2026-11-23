// 枚举字符串单一真相源（const 对象 + 类型别名模式，对齐 vue 版 src/constants 规范）：
// 业务代码禁止硬编码下列字面量，一律从此处取。
// 例外：SDK wire 协议字段的兼容映射（5.x 'image'/'voice' vs 4.x 遗风 'img'/'audio'、
// PushManager 的 remindType 等 SDK 侧枚举）保留字面量，集中在 libs/chat 的 message-body/toMessageItem/summaryOf 边界。

export const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  FILE: 'file',
  // 自定义消息（wire 'custom'，事件名/字符串参数在 body，业务载荷另可挂 ext）：
  // 多场景卡片消息的唯一收发通道，#custom-message 插槽按 customEvent 判别
  CUSTOM: 'custom',
  // 复合消息：只接收展示，body 为有序分段数组，不提供发送入口
  MULTI_BODY: 'multi_body',
  // 位置目前仅作为复合消息分段展示；独立位置消息仍走不支持占位
  LOCATION: 'location',
  // 本地系统通知（群事件/交易状态灰条）：只落本地消息列表，不发服务端
  NOTICE: 'notice',
  OTHER: 'other'
} as const

export type MessageTypeValue = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE]

export const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  RECALLED: 'recalled'
} as const

export type MessageStatusValue = (typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS]

/** 流式消息状态（M2.13）：与 websdk StreamMessageStatus 公开值一一对应。
 *  wire 字面量集中在此处，chat 边界转成 EmStreamInfo 后业务代码只认常量。
 *  终态 = COMPLETED / START_COMPLETED（单分片完成）/ ERROR；传输中 = START / IN_PROGRESS */
export const STREAM_MESSAGE_STATUS = {
  START: 'STREAM_START',
  START_COMPLETED: 'STREAM_START_COMPLETED',
  IN_PROGRESS: 'STREAM_IN_PROGRESS',
  COMPLETED: 'STREAM_COMPLETED',
  ERROR: 'STREAM_ERROR'
} as const

export type StreamMessageStatusValue = (typeof STREAM_MESSAGE_STATUS)[keyof typeof STREAM_MESSAGE_STATUS]

/** 流式打字机光标字符（em-text-message 消费）：蒸汽端不支持 CSS 动画，静态常亮降级 */
export const STREAM_CURSOR_CHAR = '▍'

/** UIKit 版本号：与 uni_modules/easemob-uikit-uni/package.json 的 version 保持同步（发版时手动对齐）。
 *  当前消费方：自动派生 deviceId 的三段式中间段（Platform_uikitVersion_uuid）；
 *  升级后版本段变化，服务端会视为新设备。不运行时读 package.json（小程序端不可靠） */
export const UIKIT_VERSION = '1.0.0'

/** 流式消息业务自定义类型（stream.customType）：内核只内置纯文本渲染，
 *  markdown 等富格式由宿主经 em-chat-page 的 #stream-message 插槽接管 */
export const STREAM_CUSTOM_TYPE = {
  TEXT: 'text',
  MARKDOWN: 'markdown'
} as const

export type StreamCustomTypeValue = (typeof STREAM_CUSTOM_TYPE)[keyof typeof STREAM_CUSTOM_TYPE]

export const CONVERSATION_TYPE = {
  SINGLE_CHAT: 'singleChat',
  GROUP_CHAT: 'groupChat'
} as const

export type ConversationTypeValue = (typeof CONVERSATION_TYPE)[keyof typeof CONVERSATION_TYPE]

export const CHAT_INPUT_MODE = {
  SINGLE: 'single',
  MULTILINE: 'multiline'
} as const

export type ChatInputModeValue = (typeof CHAT_INPUT_MODE)[keyof typeof CHAT_INPUT_MODE]

/** 消息 ext 自定义 key */
export const MESSAGE_EXT_KEY = {
  /** 引用（1.0 起主协议）：与 vue 版 `ext.msgQuote` 同 key、同结构，跨 UIKit 互认 */
  QUOTE: 'msgQuote',
  /** 引用（0.x 兼容）：仅用于接收旧 uni 版消息 / 发送时双写，新代码不要直接读写 */
  QUOTE_LEGACY: 'emQuote',
  // @提及列表（userId 数组）：与 vue 版同 key，跨 UIKit 互认
  MENTION: 'em_at_list'
} as const

export type MessageExtKeyValue = (typeof MESSAGE_EXT_KEY)[keyof typeof MESSAGE_EXT_KEY]

/** cmd 信号消息的 action 名（UIKit 应用层协议，与 vue 版对齐以便跨端互认） */
export const CMD_ACTION = {
  TYPING_BEGIN: 'TypingBegin'
} as const

export type CmdActionValue = (typeof CMD_ACTION)[keyof typeof CMD_ACTION]

export const CONNECTION_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  /** 已登录后的自动重连中（SDK onConnecting attempt>0）；与首次连接区分，宿主可据此显示「重连中」 */
  RECONNECTING: 'reconnecting',
  ONLINE: 'online',
  CLOSED: 'closed'
} as const

export type ConnectionStatusValue = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS]

// 主题偏好：AUTO 跟随系统（默认），LIGHT/DARK 为强制档；解析后的实际主题只有 light/dark
export const THEME_MODE = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark'
} as const

export type ThemeModeValue = (typeof THEME_MODE)[keyof typeof THEME_MODE]

/** 实际生效的明暗主题（AUTO 解析后形态） */
export type ResolvedThemeModeValue = 'light' | 'dark'

export const LOCALE = {
  ZH_CN: 'zh-CN',
  EN: 'en'
} as const

export type LocaleValue = (typeof LOCALE)[keyof typeof LOCALE]

/** uikit 内置 logger 级别（silent 全关） */
export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SILENT: 'silent'
} as const

export type LogLevelValue = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL]

/** 会话页菜单 action key（加号面板 + 会话长按） */
export const CONVERSATION_MENU_KEY = {
  NEW_CHAT: 'new-chat',
  CREATE_GROUP: 'create-group',
  PIN: 'pin',
  MUTE: 'mute',
  DELETE: 'delete'
} as const

export type ConversationMenuKeyValue = (typeof CONVERSATION_MENU_KEY)[keyof typeof CONVERSATION_MENU_KEY]

/** 会话列表筛选 tab key（对齐 vue 版 conversation-tabs 的 ConversationTabKey 与默认顺序） */
export const CONVERSATION_TAB_KEY = {
  ALL: 'all',
  UNREAD: 'unread',
  AT_ME: 'atMe',
  SINGLE: 'single',
  GROUP: 'group'
} as const

export type ConversationTabKeyValue = (typeof CONVERSATION_TAB_KEY)[keyof typeof CONVERSATION_TAB_KEY]

/** UserInfoManager 批量查询用户资料单次上限，服务端硬限制 100 */
export const USER_INFO_REQUEST_BATCH_SIZE = 100

/** PushManager 批量查询会话免打扰（getConversationSilentModes）单次上限，SDK 硬限制 20 */
export const CONVERSATION_SILENT_MODE_BATCH_SIZE = 20

/** 当前会话收消息清服务端未读的合批间隔（毫秒）：避免每条消息一次 REST，同时保证离页后未读不复活 */
export const CONVERSATION_UNREAD_CLEAR_THROTTLE = 2000

/** 非当前会话的内存消息保留上限：进入其他会话时只留最近 N 条，回会话时重新拉最新页，避免多群长聊无限占内存。
 *  当前会话不设限（单次会话内全量），离开时按此上限裁剪。 */
export const CONVERSATION_MESSAGE_RETAIN_LIMIT = 100

/** 会话筛选 tab 默认全集与顺序（对齐 vue DEFAULT_CONVERSATION_TABS） */
export const DEFAULT_CONVERSATION_TABS: ConversationTabKeyValue[] = [
  CONVERSATION_TAB_KEY.ALL,
  CONVERSATION_TAB_KEY.UNREAD,
  CONVERSATION_TAB_KEY.AT_ME,
  CONVERSATION_TAB_KEY.SINGLE,
  CONVERSATION_TAB_KEY.GROUP
]

/** 聊天页消息长按菜单 action key */
export const MESSAGE_MENU_KEY = {
  COPY: 'copy',
  QUOTE: 'quote',
  EDIT: 'edit',
  PIN: 'pin',
  /** 下载附件（仅已发送的图片/视频/文件消息出现；App/小程序保存到相册或打开文档，H5 浏览器下载） */
  DOWNLOAD: 'download',
  RECALL: 'recall',
  /** 失败消息重发（仅 status=failed 出现，点击后走与红叹号一致的重发链路） */
  RESEND: 'resend',
  DELETE: 'delete'
} as const

export type MessageMenuKeyValue = (typeof MESSAGE_MENU_KEY)[keyof typeof MESSAGE_MENU_KEY]

/** 聊天页时间分隔条：相邻消息间隔超过该值插入时间条（对齐 vue 版 messageListConfig.groupInterval 默认 5 分钟） */
export const TIME_DIVIDER_INTERVAL = 5 * 60 * 1000

/** 消息撤回时间窗口（毫秒，2 分钟；超出后长按菜单不出现撤回项，对齐 vue 版 recallTimeLimit 默认 2min） */
export const RECALL_TIME_LIMIT = 2 * 60 * 1000

/** 单条消息可编辑次数上限（websdk 5.x modifyMessage 服务端约束；vue 版旧口径 5 次，以本地 SDK d.ts 为准） */
export const MESSAGE_MODIFY_COUNT_LIMIT = 10

/** 置顶条预览文本截断长度（对齐 vue 版 pinnedBar maxPreviewLength 默认 30） */
export const PINNED_PREVIEW_MAX_LENGTH = 30

/** typing 信号：发送节流间隔（同一会话内该间隔最多发一条 cmd），对齐 vue 版 5s */
export const TYPING_THROTTLE = 5 * 1000

/** typing 信号：接收方「正在输入」展示超时（超时未续即清除），对齐 vue 版 5s */
export const TYPING_TIMEOUT = 5 * 1000

/** 流式消息：分片合并的最小重绘间隔（毫秒）。SDK 高频下发时按此间隔合批写 store，
 *  把「每个分片一次响应式更新 + 一次列表滚动」压到 ≤20 次/秒；0 = 不分批（逐片即写）。
 *  终态分片不受节流约束，立即落盘，保证最后一段内容不延迟 */
export const STREAM_FLUSH_INTERVAL = 50

/** 输入栏底部面板（emoji/媒体）最小高度 px：对齐 vue 版 panelHeightVar 兜底 280px；
 * 曾测得真实键盘高度高于此值时面板高度跟随键盘，键盘↔面板互切无跳变 */
export const PANEL_MIN_HEIGHT = 280

/** 输入栏「+」媒体面板 action key */
export const MEDIA_PANEL_KEY = {
  ALBUM: 'album',
  CAMERA: 'camera',
  VIDEO: 'video',
  FILE: 'file',
  VOICE: 'voice'
} as const

export type MediaPanelKeyValue = (typeof MEDIA_PANEL_KEY)[keyof typeof MEDIA_PANEL_KEY]

/** 联系人页菜单 action key（条目长按） */
export const CONTACT_MENU_KEY = {
  REMARK: 'remark',
  DELETE: 'delete'
} as const

export type ContactMenuKeyValue = (typeof CONTACT_MENU_KEY)[keyof typeof CONTACT_MENU_KEY]

/** 好友申请状态 */
export const CONTACT_INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined'
} as const

export type ContactInviteStatusValue = (typeof CONTACT_INVITE_STATUS)[keyof typeof CONTACT_INVITE_STATUS]

/** 申请/邀请类型（好友申请 vs 群邀请，同表存储按 kind 分化处理链路） */
export const CONTACT_INVITE_KIND = {
  CONTACT: 'contact',
  GROUP: 'group'
} as const

export type ContactInviteKindValue = (typeof CONTACT_INVITE_KIND)[keyof typeof CONTACT_INVITE_KIND]

/** 通讯录入口页 entry key（em-contact-page/em-contact-nav 透出，宿主按 key 接线路由） */
export const CONTACT_ENTRY_KEY = {
  NOTICE: 'notice',
  GROUP: 'group',
  CONTACT: 'contact'
} as const

export type ContactEntryKeyValue = (typeof CONTACT_ENTRY_KEY)[keyof typeof CONTACT_ENTRY_KEY]

/** 群成员角色（对齐 websdk GroupRole 与 vue 版 GROUP_MEMBER_ROLE） */
export const GROUP_MEMBER_ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member'
} as const

export type GroupMemberRoleValue = (typeof GROUP_MEMBER_ROLE)[keyof typeof GROUP_MEMBER_ROLE]

/** 群成员宫格首屏成员展示上限（聊天详情页成员宫格，对齐 vue chat-info-drawer displayedMembers = 8；加/减操作格另计） */
export const GROUP_MEMBER_GRID_COUNT = 8

/** 群成员游标分页每页条数 */
export const GROUP_MEMBER_PAGE_SIZE = 20

/** 群系统通知事件 key（本地插入群消息列表的灰条通知；对照 vue NOTICE_EVENT_TYPE 语义裁剪） */
export const GROUP_NOTICE_EVENT = {
  GROUP_CREATED: 'groupCreated',
  MEMBERS_JOINED: 'membersJoined',
  MEMBERS_EXITED: 'membersExited',
  GROUP_NAME_CHANGED: 'groupNameChanged',
  ANNOUNCEMENT_CHANGED: 'announcementChanged',
  OWNER_CHANGED: 'ownerChanged',
  USER_REMOVED: 'userRemoved',
  GROUP_DESTROYED: 'groupDestroyed',
  ADMIN_ADDED: 'adminAdded',
  ADMIN_REMOVED: 'adminRemoved',
  ALL_MEMBER_MUTE_CHANGED: 'allMemberMuteChanged'
} as const

export type GroupNoticeEventValue = (typeof GROUP_NOTICE_EVENT)[keyof typeof GROUP_NOTICE_EVENT]

/** 群成员操作菜单 action key（成员管理视图 em-action-sheet） */
export const GROUP_MEMBER_ACTION = {
  CHAT: 'chat',
  SET_ADMIN: 'set-admin',
  REMOVE_ADMIN: 'remove-admin',
  TRANSFER_OWNER: 'transfer-owner',
  REMOVE: 'remove'
} as const

export type GroupMemberActionValue = (typeof GROUP_MEMBER_ACTION)[keyof typeof GROUP_MEMBER_ACTION]

/** 群公告最大长度（对齐 vue 版 GROUP_INFO_LIMIT.ANNOUNCEMENT_MAX_LENGTH = 512，跨 UIKit 校验口径一致） */
export const GROUP_ANNOUNCEMENT_MAX_LENGTH = 512

/** 群名称最大长度（对齐 vue 版 GROUP_INFO_LIMIT.NAME_MAX_LENGTH = 255） */
export const GROUP_NAME_MAX_LENGTH = 255

/** em-select-contact 选择模式 */
export const SELECT_CONTACT_MODE = {
  SINGLE: 'single',
  MULTIPLE: 'multiple'
} as const

export type SelectContactModeValue = (typeof SELECT_CONTACT_MODE)[keyof typeof SELECT_CONTACT_MODE]

/** em-load-more 触底加载 footer 四态 */
export const LOAD_MORE_STATE = {
  LOADING: 'loading',
  NO_MORE: 'noMore',
  BUTTON: 'button',
  ERROR: 'error'
} as const

export type LoadMoreStateValue = (typeof LOAD_MORE_STATE)[keyof typeof LOAD_MORE_STATE]

/** UIKit 业务错误码（挂在 Error.code 上，与 SDK errorCode 无关）：发送失败归因、网络预检测拦截等场景识别用 */
export const ERROR_CODE = {
  /** 发送前预检测命中：系统网络离线（该次发送未触达 SDK） */
  NETWORK_OFFLINE: 'EM_NETWORK_OFFLINE',
  /** 当前没有登录账号：依赖连接的操作立即失败，不进入 waitOnline 等待 */
  UNAUTHORIZED: 'EM_UNAUTHORIZED',
  /** 发送/拉取前的连接等待超时（waitOnline） */
  NETWORK_TIMEOUT: 'EM_NETWORK_TIMEOUT',
  /** SDK onSendTimeout 信号：发送队列超时，等待中的消息统一落 FAILED 归因 */
  SEND_TIMEOUT: 'EM_SEND_TIMEOUT',
  /** 失败重发时本地媒体临时文件已被系统清理（无远端 URL 可复用） */
  MEDIA_UNAVAILABLE: 'EM_MEDIA_UNAVAILABLE',
  /** 下载附件时宿主/系统未授予相册权限（App/小程序保存图片/视频） */
  DOWNLOAD_AUTH_DENIED: 'EM_DOWNLOAD_AUTH_DENIED',
  /** 当前消息类型没有可下载的附件（非图片/视频/文件，或 URL 为空） */
  DOWNLOAD_UNSUPPORTED: 'EM_DOWNLOAD_UNSUPPORTED',
  /** 录音在停止结算前被取消（正常取消，不作为设备或权限失败提示） */
  RECORD_CANCELLED: 'EM_RECORD_CANCELLED'
} as const

export type ErrorCodeValue = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/** 文档预览显式指定的文件扩展名（uni.openDocument 文档口径；App 对未知类型仍交给系统尝试，小程序仅这七类） */
export const OPEN_DOCUMENT_FILE_TYPES = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']

/** 内置文件消息批量发送的并发上限（多选附件时按窗口并发，避免同时打满上传通道） */
export const FILE_SEND_CONCURRENCY = 3

/** 群消息已读人数批量查询的单次上限（服务端上限 20，超限直接 reject） */
export const GROUP_READ_RECEIPT_BATCH = 20

/** 联系人字母分组序列（A-Z + #，对齐 vue 版 DEFAULT_ALPHABET_KEYS） */
export const ALPHABET_KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'
] as const

/** 内置 emoji 字符集：vue 版 EMOJI_ALL（uikit-core emoji-picker）前 96 个，一期单面板无 tab 分页。
 *  config 默认值来源（uiConfig.emojiList），运行时经 EmKitConfig.emojiList / setConfig 覆盖 */
export const DEFAULT_EMOJI_LIST: string[] = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
  '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
  '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
  '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺'
]
