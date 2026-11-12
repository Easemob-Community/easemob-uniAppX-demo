// 账户页本地状态：手机号登录凭证（注销账户用）与签名缓存（uikit EmUserInfo 只有 nickname/avatarUrl，签名落本地）
// 直接用 uni storage：与 uikit setStorage/getStorage 封装等价（其内部即 setStorageSync），
// 同时保持本模块零依赖，可被单文件 UTS 编译/其它 common 模块独立引用

const PHONE_CRED_KEY = 'demo_account_phone_cred'
const LOGIN_CRED_KEY = 'demo_login_credentials'
const SIGNATURE_KEY_PREFIX = 'demo_account_sign_'

export class PhoneCredentials {
	phoneNumber: string = ''
	chatToken: string = ''
}

// 仅手机号登录可注销账户：登录成功后写入，userId/token 登录与登出时清除
export function savePhoneCredentials(phoneNumber: string, chatToken: string): void {
	const cred = new PhoneCredentials()
	cred.phoneNumber = phoneNumber
	cred.chatToken = chatToken
	try {
		uni.setStorageSync(PHONE_CRED_KEY, JSON.stringify(cred))
	} catch (e) {}
}

export function getPhoneCredentials(): PhoneCredentials | null {
	let raw = ''
	try {
		raw = uni.getStorageSync(PHONE_CRED_KEY) as string
	} catch (e) {}
	if (raw === '') {
		return null
	}
	try {
		const parsed = JSON.parse(raw) as PhoneCredentials
		if (parsed.phoneNumber !== '' && parsed.chatToken !== '') {
			return parsed
		}
	} catch (e) {}
	return null
}

export function clearPhoneCredentials(): void {
	try {
		uni.removeStorageSync(PHONE_CRED_KEY)
	} catch (e) {}
}

// 免输入自动登录凭证：登录成功即写入，启动时据此直连；自动登录失败与登出时清除
export class LoginCredentials {
	userId: string = ''
	token: string = ''
}

export function saveLoginCredentials(userId: string, token: string): void {
	const cred = new LoginCredentials()
	cred.userId = userId
	cred.token = token
	try {
		uni.setStorageSync(LOGIN_CRED_KEY, JSON.stringify(cred))
	} catch (e) {}
}

export function getLoginCredentials(): LoginCredentials | null {
	let raw = ''
	try {
		raw = uni.getStorageSync(LOGIN_CRED_KEY) as string
	} catch (e) {}
	if (raw === '') {
		return null
	}
	try {
		const parsed = JSON.parse(raw) as LoginCredentials
		if (parsed.userId !== '' && parsed.token !== '') {
			return parsed
		}
	} catch (e) {}
	return null
}

export function clearLoginCredentials(): void {
	try {
		uni.removeStorageSync(LOGIN_CRED_KEY)
	} catch (e) {}
}

// 签名本地缓存：按 userId 隔离，登录页换号/登出由 account 页注销与退出链路负责清理当前号缓存
export function saveSignature(userId: string, sign: string): void {
	if (userId === '') return
	try {
		uni.setStorageSync(SIGNATURE_KEY_PREFIX + userId, sign)
	} catch (e) {}
}

export function getSignature(userId: string): string {
	if (userId === '') return ''
	try {
		return uni.getStorageSync(SIGNATURE_KEY_PREFIX + userId) as string
	} catch (e) {
		return ''
	}
}
