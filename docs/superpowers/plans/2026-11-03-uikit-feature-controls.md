# UIKit Feature Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把调研确认的 UIKit 能力做成当前 Demo 可实时演示、可持久化的开关、选择项和工具入口。

**Architecture:** 新增 Demo 侧统一偏好状态作为唯一数据源，启动及每次修改时通过 `setConfig` 同步 UIKit 全局配置；聊天页、会话页直接消费同一响应式状态。设置注册表同时描述布尔开关和选择项，页面只负责渲染与写回，不直接散改 UIKit 配置。演示工具入口复用 UIKit 已有 API 和组件，不修改 `uni_modules`。

**Tech Stack:** uni-app x 蒸汽模式、Vue 组合式 API、标准 TypeScript、现有 easemob-uikit-uni。

**Spec:** 用户已确认按当前会话中的 UIKit Demo 特性调研建议执行。

## Global Constraints

- script 使用标准 ts，import 不带后缀，仅使用组合式 API。
- 不新增依赖，不修改 UIKit 源码或 `unpackage/`。
- 保留用户已有的 `manifest.json`、账户页和关于页改动，不做无关重构。
- 编辑消息与撤回后重新编辑是两个独立能力；防诈骗提示条继续保持默认行为。
- 项目无自动化测试框架，不新增测试脚手架，以静态核对和 HBuilderX 编译验证为准。
- 不执行 git commit。

## Review Focus

- 旧持久化数据缺字段或含非法值：必须回落 UIKit 默认值；由配置加载白名单核对和启动编译覆盖。
- 消息菜单、会话菜单、联系人菜单数组：关闭一项只移除对应 key，不影响其他项；由注册表逐项映射核对。
- 输入模式“默认”：不得强行把全端固定为单行或多行；由配置转换核对默认档不写 `inputMode`。
- 页面开关运行期修改：返回聊天/会话/联系人页后立即生效；由响应式 props 接线和页面场景检查覆盖。
- 长按文档入口及演示动作：不得因补发 click 重复打开；保留现有点击保护，动作项不用长按。

---

### Task 1: 统一 UIKit 特性偏好与配置注册表

**Files:**
- Create: `common/uikit-feature-state.ts`
- Modify: `common/feature-groups.ts`
- Modify: `App.uvue`

**Interfaces:**
- Produces: `uikitFeatures`、`setUIKitFeature(key, value)`、`applyUIKitFeatures()`、`demoQuickReplies`。
- State keys cover global booleans, six input capabilities, eight message menu keys, three conversation menu keys, two contact menu keys, chat/conversation page props, `inputMode`、`messageStatusPosition`、`avatarShape`、`quickReplyMode`。
- `FeatureGroup.items` supports `switch`、`choice`、`action`; choices carry value/label-key arrays.

- [ ] **Step 1:** Define a flat, typed preference object with defaults matching UIKit, safe storage loading, persistence, and conversion to `setConfig` patches.
- [ ] **Step 2:** Replace top-level-only registry definitions with grouped switch/choice/action definitions for messaging, input, message actions, conversations, chat page, contacts, and debug/tools.
- [ ] **Step 3:** Apply stored preferences during app launch without changing theme or SDK initialization behavior.
- [ ] **Step 4:** Statically verify every registry key exists in the preference object and every menu key maps to its UIKit constant.

### Task 2: 设置页渲染开关、选择项和动作入口

**Files:**
- Modify: `pages/settings/feature-group.uvue`
- Modify: `pages/settings/features.uvue`
- Modify: `common/locale/zh-CN.ts`
- Modify: `common/locale/en.ts`

**Interfaces:**
- Consumes: Task 1 registry and preference APIs.

- [ ] **Step 1:** Render switches for boolean definitions and compact selectable chips for choice definitions; display the selected option and write changes through `setUIKitFeature`.
- [ ] **Step 2:** Render action rows with chevrons and dispatch only explicit action keys; keep the existing documentation row and long-press copy behavior unchanged.
- [ ] **Step 3:** Add matching Chinese and English labels, hints, group titles, option text, and result toasts.
- [ ] **Step 4:** Check locale key-set equality and ensure no removed anti-fraud toggle or old behavior text returns.

### Task 3: 接入聊天、会话、详情和联系人页面

**Files:**
- Modify: `sub-im/pages/chat/chat.uvue`
- Modify: `pages/conversation/conversation.uvue`
- Modify: `sub-im/pages/chat-info/chat-info.uvue`

**Interfaces:**
- Consumes: `uikitFeatures` and `demoQuickReplies` from Task 1.

- [ ] **Step 1:** Bind chat connection bar, detail entry, member count, announcement, mention, sender-name mode, avatar shape, quick replies, and quick-reply mode to reactive preferences.
- [ ] **Step 2:** Bind conversation connection bar, search, and filter tabs; global menu arrays remain applied through `setConfig`.
- [ ] **Step 3:** Verify message edit and re-edit remain separate, and quick replies default to fill rather than send.
- [ ] **Step 4:** Confirm group-name editing uses the existing global UIKit configuration and requires no extra page prop.

### Task 4: AI 流式与日志/自检工具

**Files:**
- Create: `common/ai-stream-demo.ts`
- Create: `pages/settings/sdk-check.uvue`
- Modify: `sub-im/pages/chat/chat.uvue`
- Modify: `pages/settings/feature-group.uvue`
- Modify: `pages.json`

**Interfaces:**
- Produces: a pending AI-demo request consumed and cancelled by the chat page; SDK check page reads current state and performs a real conversation sync.

- [ ] **Step 1:** Adapt the official Demo mock stream helper without credentials or external dependencies; preserve complete-message behavior when streaming is disabled.
- [ ] **Step 2:** AI entry selects the latest existing conversation, navigates to it, and injects one mock stream; chat unload cancels an active timer. Empty conversation lists produce a toast.
- [ ] **Step 3:** Log export calls `EmKit.exportLogs()` and reports download/path/clipboard results.
- [ ] **Step 4:** SDK check shows connection status, current user, network state, and a real refresh result; it must not re-login, logout, create groups, or mutate messages.

### Task 5: 原子组件与状态演示入口

**Files:**
- Create: `pages/settings/uikit-components.uvue`
- Create: `pages/settings/uikit-states.uvue`
- Modify: `pages.json`

**Interfaces:**
- Consumes: existing `em-avatar`、`em-icon`、`em-empty`、`em-skeleton`、`em-button`、`em-load-more`、`em-select-contact`。

- [ ] **Step 1:** Add a component showcase using local sample data and existing UIKit components only.
- [ ] **Step 2:** Add interactive loading/retry/submitting state demonstrations with timer cleanup.
- [ ] **Step 3:** Register both pages and wire their feature-group action entries.

### Task 6: 验证交付

**Files:**
- Verify all files changed above; do not edit build output.

- [ ] **Step 1:** Run `git diff --check` and compare zh-CN/en locale key sets.
- [ ] **Step 2:** Run HBuilderX Android compile-only and require final success.
- [ ] **Step 3:** Run HBuilderX iOS simulator compile-only and require final success.
- [ ] **Step 4:** Exercise settings writes and real page bindings in an available runtime; distinguish compile verification from unperformed device checks.
- [ ] **Step 5:** Remove CLI-generated temporary files and restore only compiler-generated unrelated rewrites; report remaining pre-existing warnings without fixing unrelated issues.
