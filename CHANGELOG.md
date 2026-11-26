# 更新日志

本文档记录环信 IM uni-app x Demo 各发布标签的主要变更，按版本倒序排列。UIKit 组件库的详细变更见 [UIKit 更新日志](uni_modules/easemob-uikit-uni/changelog.md)。

## [v1.0.7] - 2026-11-26

### 调整

- 环信 Web SDK 升级至 5.2.1，修复增量会话同步丢失、取消置顶误判及本地状态被旧响应覆盖，完善群组用户资料与群名片行为。
- 登录页与项目说明同步 SDK 版本。

## [v1.0.6] - 2026-11-25

### 调整

- UIKit 升级至 1.0.6，修复鸿蒙动作菜单短文案误省略，Android 图片与视频选择改用系统选择器。
- 公共入口补充附件下载请求 URL 导出，共享本地临时附件仅在最后一条消息引用删除后清理。

## [v1.0.4] - 2026-11-25

### 新增

- 会话页支持直接创建群组，聊天表情面板支持按完整字素退格。
- 消息转发支持本地附件直接重传，并补充转发中状态与分阶段错误详情。

### 调整

- UIKit 升级至 1.0.4，优化语音、面板与键盘状态切换，以及快捷回复和消息编辑的输入交互。
- Android 选择 `content://` 附件后复制到应用沙箱，保证发送、转发与重发可重复读取。
- 文件消息支持本地优先打开，完善附件 HTTPS 下载、媒体权限引导和群聊标题显示。
- 修正登录页开关文字颜色与主题色选中样式。

## [v1.0.3] - 2026-11-24

### 调整

- 登录页“诊断日志”入口仅在开发者模式下显示，退出开发者模式后恢复隐藏。
- 登录协议弹窗的文字、链接和确认按钮改用 UIKit 主题变量，保持主题样式一致。
- UIKit 升级至 1.0.3，公共入口补充导出 `checkNetworkOnce()` 与 `subscribeNetworkStatus()`。

### 修复

- 修复 H5 短信安全验证回传，完善验证页面的消息回调处理。
- 修复 UIKit 网络状态方法未从公共入口导出导致的宿主编译失败。

## [v1.0.2] - 2026-11-23

### 新增

- 登录流程增加网络状态检测与离线提示，覆盖自动登录、短信发送及两种登录模式。
- 登录页动态读取并展示 Demo 版本号，替代硬编码版本信息。
- App 端头像上传前增加图片压缩，超限图片最长边压缩至 512px，失败时回退原图。

### 调整

- 完善 UIKit 会话同步、用户资料、网络状态和日志能力。
- 精简设置页功能开关、演示配置、自定义消息演示及 IM 分包聊天与导航配置。
- 更新主题配置、项目说明、UIKit 正式版文档与插件市场链接。

### 修复

- 修复深色模式下系统状态栏配色。
- 修复鸿蒙端应用图标显示。

## [v1.0.1] - 2026-11-17

首个带发布标签的 Demo 版本，基于 uni-app x 蒸汽模式和 `easemob-uikit-uni`，覆盖 Android、iOS、HarmonyOS、H5 与微信小程序。

### 新增

- 提供手机号 + 短信验证码、userId + token 两种登录模式，支持开发者配置、凭证持久化与自动登录。
- 提供会话、单聊、群聊、联系人、好友申请、聊天详情和账户设置等完整 IM 演示流程。
- 支持文本、表情、图片、语音、视频、文件、名片及 GIF 表情，并提供引用、编辑、撤回、重发、删除等消息操作。
- 提供浅色/深色/跟随系统、中英文切换、主题色、气泡色和全局头像形状设置。
- 提供 UIKit 特性开关、原子组件与组件状态演示、AI 流式消息、日志导出和 SDK 连通性自检。

### 修复

- 修复 iOS 首次授权后的录音状态异常，以及鸿蒙短信验证弹层显示问题。
- 修复 HBuilderX 5.34 引入 SDK 异常、深色模式双向切换和个人昵称缓存回退问题。
- 统一登录用户 ID 为小写，并修正登录协议文案换行布局。

[v1.0.7]: https://github.com/Easemob-Community/easemob-uniAppX-demo/compare/v1.0.6...v1.0.7
[v1.0.6]: https://github.com/Easemob-Community/easemob-uniAppX-demo/compare/v1.0.4...v1.0.6
[v1.0.4]: https://github.com/Easemob-Community/easemob-uniAppX-demo/compare/v1.0.3...v1.0.4
[v1.0.3]: https://github.com/Easemob-Community/easemob-uniAppX-demo/compare/v1.0.2...v1.0.3
[v1.0.2]: https://github.com/Easemob-Community/easemob-uniAppX-demo/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/Easemob-Community/easemob-uniAppX-demo/releases/tag/v1.0.1
