// Token 生命周期回调：接入 EmKit.init 的 onTokenWillExpire / onTokenExpired（EmKitConfig 契约）。
// onTokenWillExpire 契约是「返回新 token，UIKit 自动 renewToken」；本 demo 的 App Server 未提供
// 静默换 token 端点（手机号换 token 需短信验证码，开发者模式 token 为用户自填），故返回空串跳过续期，
// 由 onTokenExpired 的持久化凭证透明重连兜底。接入方有刷新端点时，在 tokenWillExpireHandler 返回新 token 即可。
// onTokenExpired：SDK 已断开，先用持久化凭证透明重连（免感恢复），失败清凭证回登录页
// （对齐 vue3 demo 的 onTokenExpired → 跳登录，比其多一层无感重连兜底）。
import { EmKit } from '@/uni_modules/easemob-uikit-uni/libs'
import { clearLoginCredentials, getLoginCredentials, saveLoginCredentials } from './account-state'

let relogining = false

export function tokenWillExpireHandler(): Promise<string> {
	console.warn('[demo] token will expire: no silent refresh endpoint configured, skip renewal')
	return Promise.resolve('')
}

export function tokenExpiredHandler(): void {
	const cred = getLoginCredentials()
	if (cred == null) {
		gotoLogin()
		return
	}
	if (relogining) return
	relogining = true
	EmKit.login({ userId: cred.userId, token: cred.token })
		.then(() => {
			saveLoginCredentials(cred.userId, cred.token)
		})
		.catch(() => {
			clearLoginCredentials()
			gotoLogin()
		})
		.finally(() => {
			relogining = false
		})
}

function gotoLogin(): void {
	uni.reLaunch({ url: '/pages/login/login' })
}
