# AGENT.md

## 项目概述

本项目是 `easemob-uniAppX-demo`，基于 uni-app x、Vue 3 和 UTS。当前编译目标为 Android（`APP-ANDROID`），启动页面为 `pages/index/index`。

## 目录与关键文件

- `App.uvue`：应用生命周期、退出逻辑和全局样式。
- `main.uts`：应用入口，通过 `createSSRApp` 创建应用。
- `pages/`：页面目录；新增页面需在 `pages.json` 中注册。
- `pages.json`：页面路由与全局导航样式；`pages` 数组第一项是启动页。
- `manifest.json`：应用标识、版本及平台配置。
- `platformConfig.json`：编译目标配置。
- `static/`：静态资源，页面中可通过 `/static/...` 引用。
- `uni.scss`：uni-app 公共 SCSS 变量。

## 开发约定

- 页面和应用组件使用 `.uvue`，脚本采用 `<script setup lang="uts">`；入口及纯逻辑文件使用 `.uts`。
- 遵循 UTS 和 uni-app x 的 API、组件及样式能力，不要直接套用浏览器 DOM、Web API 或普通 TypeScript 写法。
- 平台差异使用现有条件编译风格，例如 `// #ifdef APP-ANDROID`；修改共享逻辑时检查目标平台行为。
- 保持现有代码风格：UTF-8、LF、Tab 缩进（宽度 4）、去除行尾空白并保留文件末尾换行。
- 优先复用现有 uni-app x 能力。项目当前没有 `package.json`，不要默认引入 npm 依赖或基于 Web 的构建工具。
- 修改应用入口、页面路由、版本或平台能力时，同步检查对应的配置文件。

## 构建与验证

- 使用支持 uni-app x 的 HBuilderX 打开项目，并运行到 Android 模拟器或真机。
- 当前仓库没有命令行构建脚本和自动化测试配置，不要虚构或假设存在 npm 命令。
- 修改后至少验证受影响页面的编译、启动和实际交互；涉及条件编译时，应验证对应平台。
- 不提交 `unpackage/`、`.hbuilderx/`、`.DS_Store` 等生成或本地环境文件，也不要提交密钥、令牌等敏感信息。

## 变更原则

- 保持改动聚焦，避免无关重构。
- 修改项目结构、开发方式或上述约定时，同步更新本文件。
