# AGENTS.md — easemob-uniAppX-demo

环信 IM uni-app x Demo（蒸汽模式），基于 `uni_modules/easemob-uikit-uni` UIKit。

## 分支规范

- 所有开发工作必须在 `dev` 分支进行；开始任务前先检查当前分支，不在 `dev` 时先切换到跟踪 `origin/dev` 的本地 `dev`。
- 提交与推送均只到 `dev`，不得直接在 `main` 上修改、提交或推送；`main` 仅在用户明确要求的发布流程中使用。

## 项目模式与语言

- **uni-app x 蒸汽模式（vapor）**：见 `manifest.json` 的 `"uni-app-x": { "vapor": true, "vapor-default-script-lang": "ts" }`。
- script 一律写**标准 ts**（或 js），**不写 `lang` 属性**（蒸汽模式下写什么都按默认 ts 编译）。
- **仅支持组合式 API**：不支持选项式 API 和 mixin。
- `.uvue` 页面/组件内可直接写 ts；**外部脚本模块也使用 `.ts` 后缀**（本项目的 `common/` 已全部迁移为 ts）。
- 例外：入口文件保留 `main.uts` 文件名（uni-app x 的入口约定），其内部同样直接写 ts。

## 代码规范

- import 一律**不带文件后缀**（写 `@/common/auth-api`，不要写 `@/common/auth-api.ts`）。
- 公共逻辑放在 `common/`（纯 ts 模块，不依赖 vue 组件，可被任意页面 import）：
  - `config.ts`：全局常量（`APP_SERVER_URL`、官方 Demo 默认 `DEFAULT_APP_KEY`、`EASEMOB_BASE_URL`、`REQUEST_TIMEOUT`）与阿里云验证环境变量（`VITE_CAPTCHA_SCENE_ID`、`VITE_CAPTCHA_PREFIX`、`VITE_CAPTCHA_SECRET`，示例见 `.env.example`，正式值放本地 env 文件）
  - `request.ts`：`requestJson` 统一请求封装
  - `auth-api.ts`：登录/短信/手机号解析/注销/头像上传等 App Server 接口
  - `account-state.ts`：手机号登录凭证与签名的本地存储
  - `settings-state.ts`：设置页共享的响应式状态与 Demo 业务开关
  - `uikit-feature-state.ts`：UIKit 特性开关/选择项的统一响应式状态、持久化与 `setConfig` 同步
  - `theme-style.ts`：主题色及聊天气泡色的持久化与页面样式
  - `ai-stream-demo.ts`：AI 流式消息演示请求与本地分片模拟
  - `demo-stickers.ts`：Demo GIF 表情资源、`ext.isSticker` 图片消息发送与展示地址解析
  - `dev-config.ts`：开发者配置（自定义 AppKey / 私有服务器，内存 + 可选持久化）
  - `attachment-provider.ts`：App 端附件双实现（默认 `uni.chooseFile`，可切换 `easemob-file-picker` 插件；启动及设置切换时注册到 `EmKit.setAttachmentProvider`，插件模式通过 `temporary` / `release` 交由 UIKit 管理临时副本生命周期）
  - `locale/`：demo 外壳文案（zh-CN / en），经 uikit `mergeMessages` 注入，key 统一 `demo.*` 前缀；`t()` 缺 key 回退 zh-CN
- 需要原生能力（kotlin/swift）时，通过 uts 插件扩展，不要在页面里混写 uts 原生模块；`.ts` 模块无法调用 uts 原生 API。

## 关键背景

- 登录双模式：手机号+短信验证码（调试与发行均经阿里云安全验证和 AES-GCM-256 参数加密后调用环信短信服务真实发送，首次登录与自动登录均固定使用预埋的 `easemob#easeim`），或 userId+token（直连环信 REST 获取，仅该模式允许自定义 AppKey，缺省回退官方 Demo AppKey）。
- 只有手机号登录模式支持注销账户（依赖 `account-state.ts` 保存的 chatToken）。
- 头像上传依赖 `APP_SERVER_URL` 配置的 App Server，未配置时相关功能不可用。
- tabBar 文案随语言切换由 `syncTabBarLocale()` 处理（`common/locale/index.ts`），仅在 tab 页上生效。
- `unpackage/` 是构建产物，不要手改；HBuilderX 编译验证为准。

## 回退方案

若 HBuilderX 版本较旧、蒸汽模式下无法解析 `.ts` 外部模块（报无法找到模块之类错误），把 `common/` 文件改回 `.uts` 后缀即可（ts 写法在 .uts 文件里蒸汽模式同样支持），并同步恢复 import 路径。
