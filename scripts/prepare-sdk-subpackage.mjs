#!/usr/bin/env node
// 构建后处理（PLAN.md M2.8）：把 easemob-websdk IIFE 自包含产物转译为可异步 require 的 CJS 模块，
// 拷入 mp-weixin 产物普通分包 sub-sdk/。宿主页面经微信原生跨分包 require(path, cb, fail) 回调加载。
// 等价翻译《环信 IM SDK 接入微信小程序分包异步化实施指南》的 copy-webpack-plugin + Babel transform 方案
//（本仓编译器为 HBuilderX 内置 uniapp-cli-vite，无 webpack 配置面，故走产物后处理）。
// 用法: node scripts/prepare-sdk-subpackage.mjs [mp-weixin产物目录] [--watch]
//       --watch：常驻轮询产物 app.json，重编译后自动重跑后处理（dev watch 会整体重发产物、抹掉 im-sdk.js）
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const watch = args.includes('--watch')
const positional = args.filter((arg) => arg !== '--watch')
const hostDir = resolve(positional[1] ?? resolve(root, 'demo'))
const outDir = resolve(positional[0] ?? resolve(hostDir, 'unpackage/dist/build/mp-weixin'))

const WATCH_POLL_MS = 2000
const WATCH_DEBOUNCE_MS = 1500

// 1. 读取 IIFE 并锁定全局名（升级 SDK 后全局名若变化，在此失败而不是等到真机 ChatClient undefined）
const sdkPkg = JSON.parse(readFileSync(resolve(hostDir, 'node_modules/easemob-websdk/package.json'), 'utf8'))
const iifePath = resolve(hostDir, 'node_modules/easemob-websdk/bundle/im-sdk-web.iife.js')
const iife = readFileSync(iifePath, 'utf8')
const GLOBAL_NAME = 'IMSDK'
if (!iife.startsWith(`var ${GLOBAL_NAME}=`)) {
  throw new Error(
    `websdk IIFE 全局名不再是 ${GLOBAL_NAME}（实际前缀: ${iife.slice(0, 48)}…），` +
      `请先核对 SDK ${sdkPkg.version} 的导出结构再更新本脚本`
  )
}

// 2. 追加 CJS 导出 + esbuild 语法降级（IIFE 内含 ?. / ??，旧基础库真机 SyntaxError）
const source = `${iife}\nmodule.exports=${GLOBAL_NAME};\n`
const hbxRoot = process.env.HBUILDERX_PATH ?? '/Applications/HBuilderX.app/Contents/HBuilderX'
const esbuildBin = resolve(hbxRoot, 'plugins/uniapp-cli-vite/node_modules/.bin/esbuild')

function runOnce() {
  // App 使用主包 static；小程序使用 sub-im 分包资源，删除主包重复副本以控制体积
  rmSync(resolve(outDir, 'static/emojis'), { recursive: true, force: true })
  let code
  try {
    code = execFileSync(
      esbuildBin,
      ['--loader=js', '--target=es2017', '--format=cjs', '--log-level=silent'],
      { input: source, maxBuffer: 64 * 1024 * 1024 }
    ).toString()
  } catch (e) {
    throw new Error(`SDK 分包转译失败（esbuild）: ${e.message}`)
  }

  // 3. 写入产物分包目录
  const subDir = resolve(outDir, 'sub-sdk')
  mkdirSync(subDir, { recursive: true })
  const outFile = resolve(subDir, 'im-sdk.js')
  writeFileSync(outFile, code)

  // 4. 必需导出校验：真跑一遍 CJS require，缺导出直接构建期失败（防回归）
  const REQUIRED_EXPORTS = [
    'ChatClient',
    'ChatManager',
    'ContactManager',
    'GroupManager',
    'UserInfoManager',
    'PushManager',
    'setConsoleLogEnabled',
    'setLogLevel'
  ]
  execFileSync(
    process.execPath,
    ['-e', `const m=require(${JSON.stringify(outFile)});const r=${JSON.stringify(REQUIRED_EXPORTS)};const miss=r.filter(k=>!m[k]);if(miss.length){console.error('SDK 分包缺少导出: '+miss.join(','));process.exit(1)}`],
    { maxBuffer: 16 * 1024 * 1024 }
  )

  // 5. 关闭微信开发者工具的「未使用文件忽略」：sub-sdk/im-sdk.js 只被异步 require 引用，
  // 不在静态依赖图里，默认会被依赖分析从包内剔除；私有配置会覆盖公共配置，两层都必须处理。
  const configFileNames = ['project.config.json', 'project.private.config.json']
  const patchedConfigs = []
  for (const configFileName of configFileNames) {
    const configPath = resolve(outDir, configFileName)
    if (!existsSync(configPath)) continue
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    config.setting = {
      ...(config.setting ?? {}),
      ignoreDevUnusedFiles: false,
      ignoreUploadUnusedFiles: false
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2))
    patchedConfigs.push(configFileName)
  }
  console.log(`[prepare-sdk-subpackage] 已关闭未使用文件忽略（${patchedConfigs.join(', ')}）`)

  console.log(
    `[prepare-sdk-subpackage] websdk ${sdkPkg.version} → sub-sdk/im-sdk.js ` +
      `${(Buffer.byteLength(code) / 1024).toFixed(0)}KB（${(Buffer.byteLength(iife) / 1024).toFixed(0)}KB IIFE 降级后），导出校验通过`
  )
}

runOnce()

if (watch) {
  const appJsonPath = resolve(outDir, 'app.json')
  const outFile = resolve(outDir, 'sub-sdk/im-sdk.js')
  let lastMtime = existsSync(appJsonPath) ? statSync(appJsonPath).mtimeMs : 0
  let timer = null
  console.log(`[prepare-sdk-subpackage] watch 模式：轮询 ${appJsonPath}（每 ${WATCH_POLL_MS}ms）`)
  setInterval(() => {
    const mtime = existsSync(appJsonPath) ? statSync(appJsonPath).mtimeMs : 0
    // 全量重发会改 app.json；增量重发虽不改，但也不会抹掉 im-sdk.js——两种情形都覆盖
    if (mtime === lastMtime && existsSync(outFile)) return
    lastMtime = mtime
    lastMtime = mtime
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        runOnce()
      } catch (e) {
        console.error(`[prepare-sdk-subpackage] watch 重跑失败: ${e.message}`)
      }
    }, WATCH_DEBOUNCE_MS)
  }, WATCH_POLL_MS)
}
