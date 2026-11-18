# easemob-uniappx-demo

环信 IM uni-app x Demo 是基于 `easemob-uikit-uni` 和环信 Web SDK 构建的跨端即时通讯示例，为开发者提供可直接运行的 IM 功能演示与宿主集成参考。项目采用 uni-app x 蒸汽模式（vapor），一套代码覆盖 Android、iOS、HarmonyOS、H5 和微信小程序。

Demo 内置会话、单聊、群聊、联系人、好友申请、聊天详情、消息操作、主题与中英文切换等能力，并提供 UIKit 特性开关、原子组件演示、组件状态演示、AI 流式消息演示、日志导出和 SDK 连通性自检，便于直观了解 UIKit 的组件能力及配置效果。

## 功能概览

- **登录与账户**：手机号 + 短信验证码、userId + token 两种登录模式；登录凭证持久化与自动登录；头像、昵称、签名、退出登录与注销账户。
- **会话与聊天**：会话列表、搜索、置顶、免打扰、删除、未读角标、连接状态提示；单聊、群聊与聊天详情。
- **消息能力**：文本、表情、图片、语音、视频、文件、名片及 GIF 表情；复制、引用、编辑、置顶、撤回、重发、删除、转发、已读状态和群已读回执等可按配置启用。
- **输入区能力**：语音、表情、图片、拍摄、视频、文件、单行/多行模式、快捷回复及 AI 流式消息。
- **通讯录与群组**：好友列表、好友申请、备注、删除、黑名单、群组与群公告、群成员等 UIKit 页面能力。
- **个性化**：浅色、深色、跟随系统；中英文切换；主题色、双方气泡色与头像形状设置，偏好本地持久化。
- **调试与演示**：UIKit 特性开关、消息状态位置配置、日志导出、SDK 连通性自检、原子组件与组件状态演示。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| HBuilderX | 5.21+，推荐 5.26+；当前项目使用 5.34 验证 |
| uni-app x | 蒸汽模式，Vue 3 组合式 API |
| 环信 SDK | `easemob-websdk` 5.2.0 |
| UIKit | `easemob-uikit-uni` 1.0.0-rc.2，已放在 `uni_modules/` |
| Node.js | 仅在安装 npm 依赖或执行微信小程序后处理脚本时需要 |
| Android | Android 6.0+，项目 `minSdkVersion` 为 24 |
| iOS | iOS 15+，按本机签名与自定义基座要求运行 |
| HarmonyOS | API 20+，需要 DevEco Studio、设备与签名配置 |
| 微信小程序 | 微信开发者工具；SDK 需要执行分包后处理 |

## 快速开始

### 1. 导入项目并安装依赖

将项目根目录导入 HBuilderX，然后在项目根目录执行：

```bash
npm install
```

`package.json` 不包含 `dev`、`build` 等命令；日常编译和运行以 HBuilderX 为准，不要套用 Vue3 Web Demo 的 `pnpm dev` 流程。

### 2. 配置短信安全验证

默认的手机号验证码登录会真实发送短信，获取验证码前需要通过阿里云验证码 2.0。复制环境变量示例：

```bash
cp .env.example .env.local
```

填写：

```bash
VITE_CAPTCHA_SCENE_ID=你的SceneId
VITE_CAPTCHA_PREFIX=你的prefix
VITE_CAPTCHA_SECRET=你的secret
```

三个变量缺一不可。`.env.local` 已被 `.gitignore` 排除，不要提交真实配置，也不要把业务 AppSecret 写入前端代码。

### 3. 通过 HBuilderX 运行

- **Android / iOS**：选择「运行」→「运行到手机或模拟器」，按平台完成签名或自定义基座配置。
- **HarmonyOS**：选择运行到鸿蒙设备，先在 HBuilderX 的「鸿蒙 App 配置」中完成调试签名；DevEco Studio 用于设备和 SDK 管理。
- **H5**：选择运行到浏览器。界面按移动端设计，未做桌面宽屏适配。
- **微信小程序**：先运行到微信开发者工具，再按下方「微信小程序 SDK 分包」执行后处理。

首次启动进入登录页，登录成功后进入「会话 / 通讯录 / 设置」三个主 tab。

## 登录与接入自己的环信应用

### 方式一：手机号 + 短信验证码

这是默认登录方式，使用官方 Demo 服务：

- AppKey 固定为 `easemob#easeim`。
- App Server 为 `https://appserver.easesdk.com`。
- 短信服务域名在 `common/config.ts` 中配置为 `https://a1.easemob.com`。
- 获取短信前完成阿里云安全验证，验证参数经 AES-GCM-256 加密后发送。
- 只有该模式支持通过 App Server 注销账户。

此方式适合体验官方 Demo，**不会使用开发者面板中配置的自定义 AppKey**。如需连接自己的环信应用，请使用下面的 userId + token 模式。

### 方式二：userId + token（自定义 AppKey）

1. 前往[环信控制台](https://console.easemob.com)创建应用，获取格式为 `orgName#appName` 的 AppKey。
2. 在控制台「用户管理」中创建用户，并通过服务端接口获取该用户的 token。
3. 在登录页点击表单右上角的 `</>` 图标 7 次，进入开发者模式。
4. 填写 AppKey；使用私有部署时，同时开启「私有服务器」并填写 IM / REST 服务器地址，然后保存。
5. 在 userId + token 表单中填写环信用户 ID 和访问 token，点击登录。

开发者配置默认持久化到本地；关闭「持久化配置」后仅保存在当前进程内存中，重启应用即失效。留空 AppKey 时回退到官方 Demo AppKey。

> token 应由你的服务端签发。生产项目不要把 `client_id`、`client_secret` 或其他应用密钥放入 Demo 前端。

两种登录模式都会在成功后保存 IM 登录凭证，下次启动自动重连。userId + token 模式不提供注销账户能力。

## 平台说明

### Android / iOS

- `manifest.json` 已声明 `uni-websocket`，请保留该配置，避免发行包因静态摇树缺少长连接模块。
- iOS 相机、相册和麦克风用途描述位于 `app-ios.distribute.privacyDescription`，修改后需要重新打包。
- App 端文件选择能力由 `common/attachment-provider.ts` 在启动时通过 `EmKit.setAttachmentProvider()` 注册。
- 如自定义基座缺少视频模块，请重新打基座，原生模块变化不能通过 JS 热更新生效。

深色主题还需要同步系统状态栏前景色。项目在根目录 `theme.json` 中定义明暗两套 `navigationBarTextStyle` / `navigationBarBackgroundColor`，并在 `pages.json` 的 `globalStyle` 中通过 `@` 引用；`initTheme()` / `setTheme()` 在 App 端调用 `uni.setAppTheme` 驱动切换。自定义导航栏页面的状态栏背景为透明，由 `em-nav-bar` 的顶部安全区提供页面背景，因此深色模式下时间、信号、电量等系统图标为白色，浅色模式下为黑色。新增页面如果单独覆盖 `navigationBarTextStyle`，需要同时保证它与页面顶部背景的对比度。

### HarmonyOS

- 鸿蒙签名位于 `manifest.json` 的 `app-harmony.distribute.signingConfigs`，请替换为本机配置，不要提交证书或密码。
- 麦克风、相机与网络状态权限位于 `harmony-configs/entry/`。该目录配置会整文件覆盖生成工程，修改时保留完整结构和已有权限。
- 短信验证使用本地 `static/sms-captcha/index.html` 和原生 WebView。鸿蒙创建 WebView 时 `src` 不能为 `null`；关闭协议弹层与打开验证需要拆分渲染批次，相关实现位于 `pages/login/login-sms-captcha.uvue` 和 `pages/login/login.uvue`。
- 鸿蒙验证页不能仅凭编译或脚本日志判断成功，应在真机确认滑块可见、可拖动，并能完成短信发送。

### 微信小程序 SDK 分包

环信 Web SDK 不能全部静态打入小程序主包。项目使用 `sub-sdk` 普通分包和 `scripts/prepare-sdk-subpackage.mjs` 完成 IIFE 转译、CJS 导出、语法降级、分包复制和必需导出校验。

HBuilderX GUI 开发时，在另一个终端保持以下 watch 命令运行：

```bash
node scripts/prepare-sdk-subpackage.mjs unpackage/dist/dev/mp-weixin . --watch
```

发行构建完成后执行一次：

```bash
node scripts/prepare-sdk-subpackage.mjs unpackage/dist/build/mp-weixin .
```

两个参数分别是小程序产物目录和当前宿主工程目录。脚本会同时修改公共与私有微信项目配置，防止 `sub-sdk/im-sdk.js` 被「忽略未使用文件」剔除；这些修改发生在 `unpackage/` 构建产物中，每次重新构建后需要重新执行。

脚本默认使用 macOS 下 `/Applications/HBuilderX.app/Contents/HBuilderX` 内置的 esbuild。安装路径不同时，通过 `HBUILDERX_PATH` 指向包含 `plugins/uniapp-cli-vite` 的 HBuilderX 内部目录。

## 服务配置与账户能力

`common/config.ts` 中的服务常量如下：

| 配置 | 当前值 | 用途 |
| --- | --- | --- |
| `APP_SERVER_URL` | `https://appserver.easesdk.com` | 手机号登录、手机号解析用户、头像上传、注销账户 |
| `DEFAULT_APP_KEY` | `easemob#easeim` | 官方 Demo AppKey；手机号模式固定使用 |
| `EASEMOB_BASE_URL` | `https://a1.easemob.com` | 获取测试 token 与发送短信验证码 |
| `REQUEST_TIMEOUT` | `30000` | 普通请求超时时间（毫秒） |

手机号解析、头像上传和注销账户依赖 App Server。自建这些能力时，需要保持 `common/auth-api.ts` 中的接口契约，或同步修改该模块；仅替换自定义 AppKey 不会自动替换官方 App Server。

## 关键代码索引

| 文件 | 作用 |
| --- | --- |
| `App.uvue` | 主题、UIKit 特性、tabBar 文案、附件能力与返回退出初始化 |
| `main.uts` | uni-app x 入口，创建 Vue 应用 |
| `theme.json` | 原生导航栏与系统状态栏的明暗主题变量 |
| `pages/login/login.uvue` | 双模式登录、自动登录、开发者配置与安全验证流程 |
| `pages/login/login-sms-captcha.uvue` | 短信安全验证 WebView 与原生消息回调 |
| `common/config.ts` | AppKey、App Server、请求超时与验证环境变量 |
| `common/auth-api.ts` | 登录、短信、手机号解析、注销与头像上传接口 |
| `common/account-state.ts` | 自动登录凭证、手机号凭证与签名缓存 |
| `common/dev-config.ts` | 自定义 AppKey、私有服务器与开发者凭证持久化 |
| `common/uikit-feature-state.ts` | UIKit 特性状态、持久化与 `setConfig` 同步 |
| `common/settings-state.ts` | Demo 宿主侧业务开关 |
| `common/feature-groups.ts` | 设置页特性分组与调试入口 |
| `common/theme-style.ts` | 主题色、双方气泡色配置及持久化 |
| `common/locale/` | 中英文案注入与原生 tabBar 文案同步 |
| `common/attachment-provider.ts` | App 端附件选择能力注册 |
| `pages/` | 登录、会话、通讯录、设置与通用 WebView 页面 |
| `sub-im/` | 聊天、聊天详情、群组、通知等 IM 页面分包与 Demo 组件 |
| `sub-sdk/` | 微信小程序 SDK 分包占位页 |
| `static/sms-captcha/` | 阿里云验证页面、uni WebView 桥接与参数加密 |
| `uni_modules/easemob-uikit-uni/` | 环信 uni-app x UIKit 源码、组件与逻辑库 |

## 目录结构

```text
├── App.uvue
├── main.uts
├── manifest.json
├── pages.json
├── theme.json               # 原生导航栏与状态栏明暗主题
├── package.json
├── common/                 # 纯 TypeScript 公共业务模块
├── pages/                  # 主包页面
├── sub-im/                 # IM 页面分包与 Demo 组件
├── sub-sdk/                # 微信小程序 SDK 分包
├── uni_modules/
│   └── easemob-uikit-uni/  # 环信 UIKit
├── static/                 # 图片、表情、tabBar 与短信验证静态页
├── scripts/                # 微信小程序 SDK 分包后处理
├── harmony-configs/        # 鸿蒙权限等整文件覆盖配置
├── app-icons/              # App 图标
└── unpackage/              # HBuilderX 构建产物（不入库、不手改）
```

## 开发约定

- 蒸汽模式下 script 使用标准 TypeScript（或 JavaScript）和 Vue 3 组合式 API，不使用选项式 API 或 mixin。
- 外部公共模块使用 `.ts` 后缀；入口保留 `main.uts` 文件名。
- import 不写文件后缀，例如 `@/common/auth-api`；`@` 指向项目根目录。
- 公共逻辑放在 `common/`，保持为不依赖 Vue 组件的纯 TypeScript 模块。
- 原生 Kotlin / Swift 能力通过 UTS 插件扩展，不在 TypeScript 模块中直接调用 UTS 原生 API。
- `unpackage/` 是构建产物，不要手改；代码修改以 HBuilderX 编译和真机运行验证为准。
- 本地 env、签名、证书、token 与日志中的敏感信息不要提交。

## 已知限制

- 文件消息的打开和下载目前仅展示气泡，未接入完整下载打开流程。
- 语音发送仅 App 和微信小程序开放，H5 隐藏入口。
- H5 使用移动端布局，未做桌面宽屏适配。
- 视频播放依赖系统或浏览器解码能力；大视频需要等待下载完成。
- UIKit 更完整的平台边界与宿主接入说明见[本地 UIKit 文档](uni_modules/easemob-uikit-uni/readme.md)。

## 相关链接

- [环信控制台](https://console.easemob.com)
- [环信文档中心](https://doc.easemob.com)
- [环信 uni-app x UIKit 仓库](https://github.com/Easemob-Community/easemob-uikit-uniapp)
- [uni-app x 文档](https://doc.dcloud.net.cn/uni-app-x/)
