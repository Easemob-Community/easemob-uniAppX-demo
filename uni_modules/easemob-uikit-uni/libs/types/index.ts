import type {
  ChatInputModeValue,
  ConnectionStatusValue,
  ContactInviteKindValue,
  ContactInviteStatusValue,
  ContactMenuKeyValue,
  ConversationMenuKeyValue,
  ConversationTypeValue,
  GroupMemberRoleValue,
  LocaleValue,
  LogLevelValue,
  MessageMenuKeyValue,
  MessageStatusValue,
  MessageTypeValue,
  ResolvedThemeModeValue,
  StreamMessageStatusValue,
  ThemeModeValue
} from '../constants'

export type EmConnectionStatus = ConnectionStatusValue

/** 会话类型（单聊/群聊），联合类型自 CONVERSATION_TYPE 常量派生 */
export type EmChatType = ConversationTypeValue

export type EmChatInputMode = ChatInputModeValue

/** 输入栏功能集（resolved 形态；EmKitConfig.inputFeatures 为其可选子集） */
export interface EmInputFeatures {
  voice: boolean
  emoji: boolean
  image: boolean
  camera: boolean
  video: boolean
  file: boolean
  /** 输入形态；缺省按 sendOnReturn 兼容旧三态，显式设置后优先于 sendOnReturn */
  inputMode?: EmChatInputMode
  /** 旧回车键配置：仅在未显式设置 inputMode 时决定输入形态与回车行为 */
  sendOnReturn: boolean
}

/**
 * 组件级水印配置：页面 `watermark` prop 的对象形态（字符串等价于 `{ text }`）。
 * 只描述默认平铺内容（em-watermark）；需要整层自绘时用页面 `#watermark` 插槽。
 */
export interface EmWatermarkOptions {
  /** 水印文案（通常为当前用户昵称 + userId）；空串 = 不显示，可作运行期开关 */
  text: string
  /** 字号（px），默认 12 */
  fontSize?: number
  /** 整层不透明度，默认 0.08 */
  opacity?: number
  /** 旋转角度（度），默认 -20 */
  rotate?: number
  /** 文字颜色，默认 var(--em-text-primary)，暗色主题自动反转 */
  color?: string
}

/** 附件选择上下文：聊天页调起宿主附件能力时透传；resolve 外部 URI 时可只带 mimeTypes */
export interface EmAttachmentPickOptions {
  conversationId?: string
  chatType?: EmChatType
  /** 允许的 MIME，空/不传 = 不限（由宿主实现解释） */
  mimeTypes?: string[]
  /** 是否多选，默认由宿主实现决定 */
  multiple?: boolean
}

/** 可发送附件：path 必须是本地真实路径（App/小程序原生文件选择器复制后的缓存路径） */
export interface EmAttachment {
  path: string
  name: string
  size: number
  /** MIME（透传 SDK MiniAppFile.type）；未知留空 */
  mimeType?: string
  /** true = 宿主创建的临时副本，发送成功后 UIKit 会回调 release */
  temporary?: boolean
  /** 临时文件清理（UIKit 保证同一路径最多调用一次；失败消息保留供重发） */
  release?: (path: string) => void
}

/** 宿主附件能力注入契约（App 端文件选择器由宿主提供，UIKit 不静态依赖任何 UTS 插件） */
export interface EmAttachmentProvider {
  /** 当前是否可用（如宿主云盘未登录返回 false）；缺省视为可用 */
  isAvailable?: () => boolean
  /** UIKit 通知宿主：用户点了附件入口，请选择文件。取消 resolve []，失败 reject */
  pick: (options: EmAttachmentPickOptions) => Promise<EmAttachment[]>
  /** 可选：把外部 URI（分享进入/open-with）转换为可发送附件 */
  resolve?: (uri: string, options?: EmAttachmentPickOptions) => Promise<EmAttachment | null>
}

/** 附件能力快照（EmKit.attachments） */
export interface EmAttachmentCapability {
  available: boolean
  providerName: string
}

/** 发送状态种类（气泡状态呈现配置的键）：发送中 / 失败 / 已发送未读 / 已读 */
export type EmMessageStatusKind = 'sending' | 'failed' | 'unread' | 'read'

/** 发送状态呈现配置（P2 可配置项）：位置 + 图标名 + 文案，缺省保持内置视觉。
 *  position：状态列相对气泡的位置（left = 气泡左侧，默认；right = 气泡右侧）；
 *  icons：按状态种类覆盖图标名（EmIconName，非法名回落内置图标）；
 *  texts：按状态种类追加短文案（如 failed: '失败'），空串/缺省不渲染。 */
export interface EmMessageStatusPresentation {
  position?: 'left' | 'right'
  icons?: Partial<Record<EmMessageStatusKind, string>>
  texts?: Partial<Record<EmMessageStatusKind, string>>
}

/** uiConfig 运行时形态：EmKitConfig 的 UI 行为维度解析到全量默认值之后的 store 形态（libs/store/config.ts） */
export interface EmUiConfig {
  /** 输入栏草稿，默认 true */
  enableDraft: boolean
  /** typing 信令（发送节流 + 接收展示），默认 true */
  enableTyping: boolean
  /** 撤回消息「重新编辑」按钮（自己撤回的文本墓碑），默认 true */
  enableReEdit: boolean
  /** 群信息页群名修改入口（仅群主可见），默认 true */
  enableGroupNameEdit: boolean
  /** 撤回时间窗口（毫秒），默认 120000（2 分钟） */
  recallTimeLimit: number
  /** typing 发送节流间隔（毫秒），默认 5000 */
  typingThrottle: number
  /** typing 展示超时（毫秒），默认 5000 */
  typingTimeout: number
  /** 聊天页时间分隔条间隔（毫秒），默认 300000（5 分钟） */
  timeDividerInterval: number
  /** 流式消息（AI 流式输出）开关，默认 true；关闭后 onStreamMessage 分片不再合并，
   *  等待 SDK 完整消息（onMessage）到达后一次性上屏 */
  enableStreamMessage: boolean
  /** 流式分片合批间隔（毫秒），默认 50；0 = 逐片立即写（高刷演示/调试用） */
  streamThrottle: number
  /** 单聊已读态图标（未读空心圆/已读对勾）显隐，默认 false。
   *  仅影响已读展示，不影响发送中/失败状态——后两者始终展示 */
  showReadStatus: boolean
  /** 群聊已读回执开关，默认 false：开启后群消息携带 needReadReceipt、自动回执群消息，
   *  并展示己方群消息的已读人数（服务端需支持群已读回执） */
  enableGroupReadReceipt: boolean
  /** 发送状态呈现（位置/图标/文案），默认左侧 + 内置图标 + 无文案 */
  messageStatus: Required<EmMessageStatusPresentation>
  /** 输入栏功能集，默认全开 */
  inputFeatures: EmInputFeatures
  /** 消息长按菜单项与顺序，默认 copy/quote/recall/delete 全量 */
  messageMenuKeys: MessageMenuKeyValue[]
  /** 会话长按菜单项与顺序，默认 pin/mute/delete 全量 */
  conversationMenuKeys: ConversationMenuKeyValue[]
  /** 联系人条目长按菜单项与顺序，默认 remark/delete 全量（M2.20） */
  contactMenuKeys: ContactMenuKeyValue[]
  /** emoji 面板字符集，默认内置 96（constants DEFAULT_EMOJI_LIST） */
  emojiList: string[]
  /** 品牌色覆盖（init 时落 --em-primary-color），空串 = 用 token 默认 */
  primaryColor: string
  /** 是否把 SDK 原始 payload 写入日志（默认 false；开启后仅 debug 级别采集，仍可能含 userId/昵称等，生产慎用） */
  logPayload: boolean
}

export interface EmKitConfig {
  appkey: string
  /** SDK 设备信息注入总开关，默认 true；false 时 ChatClient.init 完全不附加
   *  deviceId / customOSPlatform，退回 SDK 默认设备行为 */
  enableDeviceInfo?: boolean
  /** 显式指定设备标识（透传 SDK deviceId），原样使用、不加任何段。不传时自动派生并持久化：
   *  App 端机型信息齐备时为 `Platform_uikitVersion_brand_model_system_<框架deviceId或UUID>` 六段式，
   *  其余端/机型信息缺失时为 `Platform_uikitVersion_<框架deviceId或UUID>` 三段式
   *  （Platform 取归一平台名 android/ios/harmonyos/web/mp-weixin，uikitVersion 为 UIKit 版本段），
   *  优先级：已持久化值 → uni.getDeviceInfo().deviceId → 自生成 UUID。
   *  UIKit 升级后版本段变化，服务端会视为新设备。
   *  ChatClient 为单例且按配置逐字段比对，同一会话内传入值必须保持稳定 */
  deviceId?: string
  /** 显式指定自定义平台编号（透传 SDK customOSPlatform，需为 1–100 整数、向环信申请注册的编号）；
   *  不传则不注入，SDK 按默认平台类型上报。同 deviceId，同一会话内传入值必须保持稳定 */
  devicePlatform?: number
  /** 单聊已读回执开关，默认 true（功能开关：是否发送/接收已读回执） */
  enableReadReceipt?: boolean
  /** 单聊已读态图标显隐，默认 false（纯展示开关，与 enableReadReceipt 解耦；
   *  发送中/失败状态始终展示，不受本开关影响） */
  showReadStatus?: boolean
  /** 群聊已读回执开关，默认 false（needReadReceipt + 群回执上报 + 己方群消息已读人数展示） */
  enableGroupReadReceipt?: boolean
  /** 发送状态呈现（位置/图标/文案）：icons/texts 按 sending|failed|unread|read 覆盖，缺省保持内置 */
  messageStatus?: EmMessageStatusPresentation
  /** uikit 内置 logger 级别，默认 'info'；'silent' 全关 */
  logLevel?: LogLevelValue
  /** 是否把 SDK 原始 payload 写入日志，默认 false；需同时 logLevel='debug' 才采集，生产环境慎开 */
  logPayload?: boolean
  /** 界面语言（内置 zh-CN/en，可先 mergeMessages 注册扩展语言），默认跟随系统/上次持久化偏好；设置后写入本地并立即生效 */
  locale?: EmLocaleName
  /** SDK 自身 console 输出开关，默认 true（关闭后 SDK 日志仍经 onLog 转发进 uikit logger） */
  sdkConsoleLog?: boolean
  /** SDK 日志级别（SDK 侧枚举，仅三档），默认 'WARN' */
  sdkLogLevel?: 'DEBUG' | 'WARN' | 'ERROR'
  /** 输入栏草稿，默认 true */
  enableDraft?: boolean
  /** typing 信令开关，默认 true */
  enableTyping?: boolean
  /** 撤回消息「重新编辑」按钮，默认 true */
  enableReEdit?: boolean
  /** 群信息页群名修改入口，默认 true */
  enableGroupNameEdit?: boolean
  /** 撤回时间窗口（毫秒），默认 120000 */
  recallTimeLimit?: number
  /** typing 发送节流间隔（毫秒），默认 5000 */
  typingThrottle?: number
  /** typing 展示超时（毫秒），默认 5000 */
  typingTimeout?: number
  /** 时间分隔条间隔（毫秒），默认 300000 */
  timeDividerInterval?: number
  /** 流式消息开关（AI 流式输出），默认 true；false = 忽略 onStreamMessage 分片，等完整消息上屏 */
  enableStreamMessage?: boolean
  /** 流式分片合批间隔（毫秒），默认 50；0 = 逐片立即写 */
  streamThrottle?: number
  /** 输入栏功能集（缺项保持默认开），默认全开 */
  inputFeatures?: Partial<EmInputFeatures>
  /** 消息长按菜单项与顺序，默认四项全量 */
  messageMenuKeys?: MessageMenuKeyValue[]
  /** 会话长按菜单项与顺序，默认 pin/mute/delete 全量 */
  conversationMenuKeys?: ConversationMenuKeyValue[]
  /** 联系人条目长按菜单项与顺序，默认 remark/delete 全量（M2.20） */
  contactMenuKeys?: ContactMenuKeyValue[]
  /** emoji 面板字符集注入，默认内置 96 */
  emojiList?: string[]
  /** 品牌色（合法 CSS 颜色值），init 时写 --em-primary-color；不传用 token 默认 */
  primaryColor?: string
  /** Token 即将过期（约 80% 生命周期）回调：返回新 token，UIKit 自动 `renewToken`。
   *  不实现时 SDK 会继续用旧 token 直到过期，宿主可随时手动 `EmKit.renewToken(token)` */
  onTokenWillExpire?: () => string | Promise<string>
  /** Token 已过期（SDK 已断开）：宿主可在此跳登录页；UIKit 同时把连接状态置 CLOSED */
  onTokenExpired?: () => void
  /** 小程序端 SDK 异步加载器注入（分包异步化，PLAN.md M2.8）：resolve websdk 根导出（允许 { default } 包装）。
   *  仅 MP-WEIXIN 生效；缺省由 UIKit 经跨分包 require 从 sub-sdk 分包自加载。其它端忽略（静态导入直通） */
  sdkLoader?: () => Promise<unknown>
  /** 宿主已自行加载好的 SDK 模块注入（与 sdkLoader 二选一，模块优先）；仅 MP-WEIXIN 生效 */
  sdkModule?: unknown
}

export interface EmLoginOptions {
  userId: string
  token: string
}

/** Token 续期结果（SDK TokenRenewalResult 的中立子集） */
export interface EmTokenRenewalResult {
  /** 已成功应用的新 token */
  token: string
  /** 过期时间戳（毫秒） */
  expireAt: number
}

export type EmMessageType = MessageTypeValue

export type EmMessageStatus = MessageStatusValue

export interface EmQuoteInfo {
  msgId: string
  from: string
  /** 引用时刻的发送人展示名快照（昵称 > userId）；老数据缺省时消费方回落 from */
  fromName?: string
  text: string   // 引用时刻的快照摘要（文本截断，非文本走 locale 摘要）
  type?: EmMessageType   // 被引用消息类型（非文本用于引用卡类型图标；老数据缺省即无图标）
  /** 被引用图片/视频的缩略图（vue 版 msgThumbUrl；当前 uni 引用卡未渲染，保留给宿主/后续版本） */
  thumbUrl?: string
}

/** 消息编辑元信息（SDK MessageModifiedInfo 的中立子集）：存在即视为「已编辑」，编辑次数上限见 constants MESSAGE_MODIFY_COUNT_LIMIT */
export interface EmMessageModifiedInfo {
  operatorId: string
  operationCount: number
  operationTime: number
}

export interface EmMessageItem {
  id: string
  localId: string
  conversationId: string
  chatType: EmChatType
  type: EmMessageType
  /** 普通文本内容；流式为累计全文；复合父消息为所有非空文本分段按换行拼接的复制文本 */
  text: string
  url: string
  thumbUrl: string
  /** 图片原图地址（SDK originalImageUrl），未携带时为空串 */
  originalUrl: string
  /** 是否为 GIF 图片（SDK body.isGif 或发送文件识别结果） */
  isGif: boolean
  width: number
  height: number
  time: number
  from: string
  to: string
  self: boolean
  status: EmMessageStatus
  quote: EmQuoteInfo | null
  duration: number   // 秒，语音/视频消息用
  fileName: string   // 文件消息文件名
  fileSize: number   // 文件消息大小（字节）
  /** SDK 消息 ext 透传（自定义消息的业务载荷挂这里；发送方的引用等内部 key 也原样可见，宿主只读勿改） */
  ext: Record<string, unknown>
  /** 未识别消息类型的 SDK wire type 原文；内置文本/媒体/MULTI_BODY/NOTICE 恒为空串。
   *  独立位置消息保持 OTHER + rawType='location'，只有复合位置子项使用 LOCATION；
   *  CUSTOM 为 'custom'（旧宿主用 rawType 非空判别自定义消息仍成立）；
   *  #custom-message 插槽的新判别依据是 customEvent） */
  rawType: string
  /** 自定义消息事件名（wire custom body.event；仅 MESSAGE_TYPE.CUSTOM 非空，插槽按它分发卡片类型） */
  customEvent: string
  /** 自定义消息字符串参数（wire custom body.params；结构化业务载荷优先走 ext，二者都原样透出） */
  customParams: Record<string, string>
  /** 复合消息的有序展示分段；仅 MULTI_BODY 父消息携带，普通消息为 undefined */
  segments?: EmMessageItem[]
  /** 位置分段经纬度与地址；当前仅复合消息的 LOCATION 子项使用 */
  latitude?: number
  longitude?: number
  address?: string
  buildingName?: string
  /** SDK 附件下载密钥；普通消息与复合消息附件分段共用下载链路 */
  attachmentSecret?: string
  /** 流式消息元信息（M2.13）：仅 SDK 流式消息 / 历史中的流式终态消息携带；
   *  普通消息为 undefined。渲染层按 status 展示打字机光标 / 终态收敛 / 异常提示 */
  stream?: EmStreamInfo
  /** 消息编辑元信息（M2.20）：被编辑过（含历史拉取）即存在；未编辑为 undefined */
  modifiedInfo?: EmMessageModifiedInfo
  /** 消息是否被置顶（M2.20）：由置顶列表同步打标，气泡角标消费 */
  pinned?: boolean
  /** 撤回操作者 userId（M2.20）：本地撤回恒有值；远程撤回事件 SDK payload 无 operator 字段，保持 undefined。
   *  撤回条展示名取消息原发送者（vue 版同款语义），本字段供宿主扩展使用 */
  recalledBy?: string
  /** 最近一次发送失败的归因码：SDK 数字 code（如 1200 审核未通过 / 501 违规内容 / 222 被拉黑）
   *  或 UIKit 业务错误码（ERROR_CODE）；发送成功后清空。失败气泡与 toast 按它映射文案 */
  failCode?: number | string
  /** 消息内容被内容审核替换（SDK isContentReplaced）：气泡展示「内容已被审核修改」标识 */
  contentReplaced?: boolean
  /** 单聊消息已送达对端（SDK onMessageDelivered 命中）；宿主可据此做「已送达」展示 */
  delivered?: boolean
  /** 附件上传进度百分比（0-100）：SDK SendMessageOptions.onFileUploadProgress 回填，
   *  仅图片/语音/视频/文件等带附件的发送中存在；发送结束（成功或失败）后清空 */
  uploadProgress?: number
  /** 群聊己方消息已读人数（enableGroupReadReceipt 开启时由服务端回执/批量查询回填） */
  groupReadCount?: number
}

/** 可下载的消息附件类型（语音消息不参与下载） */
export type EmMessageDownloadKind = 'image' | 'video' | 'file'

/** downloadAttachment 选项：进度回调仅 App/小程序由 uni.downloadFile 提供，H5 无进度 */
export interface EmMessageDownloadOptions {
  onProgress?: (percent: number) => void
}

/** downloadAttachment 结果：图片/视频看 savedToAlbum，文件看 opened 与 filePath */
export interface EmMessageDownloadResult {
  kind: EmMessageDownloadKind
  fileName: string
  /** App/小程序本地文件路径；H5 走浏览器下载，恒为空串 */
  filePath: string
  /** 图片/视频已写入系统相册（App/小程序）；H5 为 false */
  savedToAlbum: boolean
  /** 文件已交给系统文档预览打开（App/小程序）；H5 或打开失败为 false */
  opened: boolean
}

/** 置顶消息条目（M2.20；SDK PinnedMessageSummary 的中立子集，message 已过 toMessageItem 归一） */
export interface EmPinnedMessageItem {
  message: EmMessageItem
  /** 置顶时间戳（毫秒），列表按降序排（最新置顶在前，对齐 vue 版） */
  pinnedAt: number
  /** 置顶操作者 userId（SDK 缺省为空串） */
  operatorId: string
}

/** 置顶条展示行（M2.20）：页面侧预计算预览文本（发送者展示名 + 类型摘要/截断，i18n 已展开），
 *  em-pinned-bar 纯展示组件消费；item 原样透出供 unpin 定位 */
export interface EmPinnedRow {
  /** 被置顶消息的服务端 id（locate 用） */
  id: string
  /** 预计算预览文本（「发送者：摘要」形态） */
  preview: string
  item: EmPinnedMessageItem
}

/** 流式消息元信息（SDK StreamMessageMeta 的中立子集，字段名与 wire 对齐便于宿主迁移） */
export interface EmStreamInfo {
  /** 业务自定义流类型（如 'text' / 'markdown'）；缺省按纯文本处理 */
  customType: string
  /** 当前分片序号（服务端排序后的序号） */
  seq: number
  /** 流式状态：START/IN_PROGRESS 为传输中；COMPLETED/START_COMPLETED/ERROR 为终态 */
  status: StreamMessageStatusValue
  /** 当前分片新增文本（增量；展示以 fullText 为准，deltaText 供宿主做动画/统计） */
  deltaText: string
  /** 截至当前分片的累计全文（与 message.text 同值；服务端已排序合并） */
  fullText: string
  /** 流式处理错误码，0 = 无错误 */
  errorType: number
  /** 服务端返回的结束原因（SDK 提供时透传） */
  finishReason?: number
}

export type EmMessageHandler = (msg: EmMessageItem) => void

/** 用户展示注入（宿主业务资料，如 CRM 昵称/员工头像）：优先于 SDK 资料参与回落链，传 null 清除 */
export interface EmUserPresentation {
  nickname?: string
  avatarUrl?: string
}

/** 会话展示注入（宿主业务资料）：name/avatar 优先于 SDK 会话名/头像；ext 为业务载荷（标签/订单态等），
 *  随 #title / #title-extra / #avatar 插槽 scope 透出供宿主自绘；传 null 清除 */
export interface EmConversationPresentation {
  name?: string
  avatar?: string
  ext?: Record<string, unknown>
}

/** 群展示注入（宿主业务资料）：name/avatar 优先于 SDK 群名/群头像；ext 随 #name-extra / #title 插槽 scope 透出；传 null 清除 */
export interface EmGroupPresentation {
  name?: string
  avatar?: string
  ext?: Record<string, unknown>
}

export interface EmConversationItem {
  conversationId: string
  chatType: EmChatType
  name: string
  avatar: string
  unreadCount: number
  lastMessageText: string
  lastMessageTime: number
  isPinned: boolean
  /** 置顶时间戳（毫秒，未置顶为 0）；列表排序用：置顶区间按置顶时间倒序（对齐 vue 版），
   *  进入会话 / 最后消息变化都不改变置顶顺序 */
  pinnedTime: number
  isMuted: boolean
}

/** 用户属性快照（昵称/头像；SDK UserInfo 的中立子集，wire 字段在 chat 边界归一） */
export interface EmUserInfo {
  userId: string
  nickname: string
  avatarUrl: string
}

/** 联系人条目（SDK Contact 的中立子集，wire 字段在 chat 边界归一） */
export interface EmContactItem {
  userId: string
  remark: string      // 己方给该好友的备注，空串即未设置
  nickname: string    // 好友资料昵称快照（来自 Contact.userInfo，同时并入 userStore）
  avatarUrl: string
  addTs: number       // 好友关系建立时间戳
}

/** 好友申请/群邀请/通知条目（内存 + uni.setStorage 持久化；好友与群邀请同表，按 kind 分化处理链路） */
export interface EmContactInvite {
  id: string          // 本地生成（from/groupId + ts），幂等合并用
  kind: ContactInviteKindValue  // contact=好友申请，group=群邀请（旧持久化数据无此字段，加载时兜底 contact）
  from: string        // 申请发起方 userId（group kind：incoming=邀请人，outgoing=被邀请人）
  message: string     // 验证/邀请附言，可为空串
  status: ContactInviteStatusValue
  outgoing: boolean   // true = 我方发出的申请被对方处理的通知
  ts: number
  groupId?: string    // group kind 必填：群 id（接受/拒绝群邀请 API 入参）
  groupName?: string  // group kind 群名快照（事件载荷可能缺省，展示走 groupStore 回落链）
}

/** 通讯录入口项（em-contact-nav props；对齐 vue 版 ContactNavEntry） */
export interface EmContactNavEntry {
  key: string         // 入口唯一标识（宿主按 key 接线路由，内置 key 见 CONTACT_ENTRY_KEY）
  label: string
  count?: number      // 计数徽标，>0 才展示
  hot?: boolean       // 红点（仅 count>0 时生效，对齐 vue 语义）
  icon?: string       // em-icon 图标名（可选，缺省不渲染左图标，对齐 vue entry.icon 默认 undefined）
}

/** 主题偏好（auto 跟随系统 / light / dark），宿主设置项 */
export type EmThemePreference = ThemeModeValue

/** 实际生效的明暗主题（themeStore.mode / themeClass 用） */
export type EmThemeMode = ResolvedThemeModeValue

/** 群组条目（SDK GroupDetail/JoinedGroupSummary 的中立子集，wire 字段在 chat 边界归一） */
export interface EmGroup {
  groupId: string
  name: string
  description: string
  /** 群主 userId（成员角色权威来源：memberMap 中该用户恒为 owner） */
  owner: string
  memberCount: number
  maxUsers: number
  avatar?: string
  public: boolean
  /** 入群是否需要管理员审批（wire joinApprovalRequired） */
  approval: boolean
  allowInvites: boolean
  inviteNeedConfirm: boolean
  /** 全员禁言（wire muteAllMembers） */
  mute: boolean
  disabled: boolean
}

/** 群成员条目（SDK GroupMemberEntry 的中立子集） */
export interface EmGroupMember {
  userId: string
  role: GroupMemberRoleValue
  /** 入群时间戳，缺失为 0（排序时排同角色末尾） */
  joinedAt: number
  nick?: string
  avatar?: string
}

/** 群成员分页结果；applied=false 表示响应已陈旧并被忽略，resolved/rejected 载荷均不得消费或改写页面错误态 */
export interface EmGroupMemberListResult {
  items: EmGroupMember[]
  cursor: string
  hasMore: boolean
  /** 当前成功且实际写入 store 时 resolve true；陈旧成功 resolve false；陈旧失败 reject 同类型结构化结果（false） */
  applied: boolean
}

/** 创建群组参数（群 domain createGroup 入参，wire 映射在 domain 边界完成） */
export interface CreateGroupParams {
  name: string
  description?: string
  /** 初始成员 userId 列表（不含创建者） */
  members?: string[]
  public?: boolean
  /** 入群是否需要管理员审批（映射 wire joinApprovalRequired） */
  approval?: boolean
  allowInvites?: boolean
  inviteNeedConfirm?: boolean
  maxMembers?: number
}

/** @提及联系人（输入栏 mention 候选与发送前 filterActiveMentions 的条目形态） */
export interface MentionContact {
  userId: string
  name: string
  avatar?: string
}

/** em-select-contact 选人条目（父组件装配好的展示数据：userId/展示名/avatar） */
export interface EmSelectContactItem {
  userId: string
  name: string
  avatar: string
}

export type EmLocaleName = LocaleValue | (string & {})

export type EmAvatarShape = 'circle' | 'square'

/** 群聊气泡上方发送者昵称行模式（伪装模式二期加 'on-change' 档） */
export type EmSenderNameMode = 'always' | 'hidden'

export interface EmActionSheetAction {
  key: string
  text: string
  icon?: string       // em-icon 图标名（EmIconName 字符串）
  danger?: boolean
  disabled?: boolean
}

/** 消息长按菜单的业务追加动作（em-chat-page extraMessageMenus，M2.12） */
export interface EmMessageMenuExtra extends EmActionSheetAction {
  /** 只在指定消息类型上出现（缺省全部；NOTICE 本地灰条恒不出现） */
  types?: EmMessageType[]
}

/** 快捷回复条目（em-quick-reply-bar / em-chat-page.quickReplies，M2.12） */
export interface EmQuickReply {
  /** 芯片展示文案 */
  label: string
  /** 点击后填入/发送的文本，缺省用 label（label 短、text 长时分开配） */
  text?: string
}

/** 快捷回复点击行为：fill=替换当前草稿（默认，用户可编辑后再发）；send=直接发送 */
export type EmQuickReplyMode = 'fill' | 'send'

/** 输入栏底部面板态（none=收起；emoji/media 互斥，useChatComposer / #input-bar 插槽共用） */
export type EmChatComposerPanel = 'none' | 'emoji' | 'media'

/** 可切换的面板种类（收起走 collapsePanel） */
export type EmChatComposerPanelKind = 'emoji' | 'media'

/** 录音手势触摸事件的最小结构（不引 DOM lib 的 TouchEvent；各端原生 TouchEvent 结构兼容） */
export interface EmChatComposerTouchEvent {
  touches: Array<{ clientY: number }>
}

/** textarea @linechange 事件的最小结构（生长输入封顶用；官方 detail：height / heightRpx / lineCount） */
export interface EmTextareaLineChangeEvent {
  detail: { lineCount: number, height: number, heightRpx: number }
}

/** 默认输入栏 `#emoji-panel` 的作用域；外壳继续负责面板高度、键盘互斥与禁用态。 */
export interface EmChatEmojiPanelScope {
  emojis: string[]
  disabled: boolean
  selectEmoji: (emoji: string) => void
  closePanel: () => void
  notifyDisabledTap: () => void
}

/** 聊天页 `#image-message` 的作用域；缺省渲染内置 em-image-message。 */
export interface EmChatImageMessageScope {
  message: EmMessageItem
  preview: (message: EmMessageItem) => void
  longPress: (message: EmMessageItem) => void
}

/**
 * em-chat-page `#input-bar` 整栏自绘插槽的 scope 契约（M2.16）。
 * 约束式替换：结构/样式可任意自绘，但必须经这里的动作函数驱动行为——
 * 键盘避让（页面壳承担）、键盘↔面板互斥、录音状态机、禁言禁用态、@ 提及、草稿持久化、
 * 引用链路由库内保持运作；绕过 setDraft/send 自行发消息将丢失上述链路。
 */
export interface EmChatInputBarScope {
  /** 当前草稿（写入走 setDraft，直接改不会触发草稿持久化/typing/@ 检测） */
  draft: string
  /** 写入草稿（草稿持久化、typing 信号、@ 尾部触发检测自动生效） */
  setDraft: (v: string) => void
  /** 当前引用目标（选择引用后由页面持有，自绘引用条展示用） */
  quote: EmQuoteInfo | null
  /** 关闭引用条 */
  closeQuote: () => void
  /** 禁用态（全员禁言且非群主/管理员）：输入/发送/语音/面板应全部禁用 */
  disabled: boolean
  /** 禁用态下任何操作尝试统一上报（页面 toast 提示），不上报则用户无感知 */
  notifyDisabledTap: () => void
  /** placeholder 覆盖建议值（禁用态为「全员禁言中」；空串可回落自绘文案） */
  placeholder: string
  /** 输入栏功能集开关（voice/emoji/image/camera/video/file，经 uiConfig.inputFeatures 配置） */
  features: EmInputFeatures
  /** emoji 字符集（uiConfig.emojiList），自绘 emoji 面板数据源 */
  emojis: string[]
  /** 快捷回复常用语（em-chat-page quickReplies 透传） */
  quickReplies: EmQuickReply[]
  /** 上推口径键盘高度（页面壳已做键盘顶起，自绘栏一般无需使用） */
  keyboardLift: number
  /** 当前底部面板态 */
  panel: EmChatComposerPanel
  /** 自绘面板的内联样式（高度跟随最近键盘高度 + safe-bottom padding），直接绑到面板根节点 */
  panelStyle: string
  /** 开/关指定面板（开面板前自动收键盘，键盘位与面板位不叠加） */
  togglePanel: (kind: EmChatComposerPanelKind) => void
  /** 收起面板 + 收键盘 */
  collapsePanel: () => void
  /** 输入框 :focus 建议绑定值（开面板/收键盘时为 false） */
  inputFocus: boolean
  /** 主动收起软键盘 */
  closeKeyboard: () => void
  /** 自绘输入框 focus 事件上报（聚焦即收面板；不上报则面板/键盘可能叠加） */
  notifyInputFocus: () => void
  /** 自绘输入框 blur 事件上报（清零键盘高度兜底） */
  notifyInputBlur: () => void
  /** 语音模式（按住说话条替换输入框） */
  voiceMode: boolean
  /** 录音中（按住未松手） */
  recording: boolean
  /** 上滑越过取消阈值（松手将取消本次录音，自绘取消态提示用） */
  willCancel: boolean
  /** 切换语音模式 */
  toggleVoiceMode: () => void
  /** 自绘「按住说话」按钮的 touchstart/touchmove/touchend/touchcancel 绑定 */
  onVoiceTouchStart: (e: EmChatComposerTouchEvent) => void
  onVoiceTouchMove: (e: EmChatComposerTouchEvent) => void
  onVoiceTouchEnd: () => void
  onVoiceTouchCancel: () => void
  /** 发送当前草稿（禁言防御/引用/@ext/清草稿/滚底内置；空草稿为空操作） */
  send: () => void
  /** 媒体动作（key 取 MEDIA_PANEL_KEY.ALBUM/CAMERA/VIDEO/FILE；选择器与发送内置） */
  selectMedia: (key: string) => void
  /** 快捷回复点选（按 quickReplyMode 填草稿或直接发送） */
  selectQuickReply: (item: EmQuickReply) => void
}
