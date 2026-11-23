import { APP_SERVER_URL, EASEMOB_BASE_URL } from './config'
import { requestJson } from './request'

export interface PhoneLoginResult {
	token: string
	chatUserName: string
}

function businessError(body: Record<string, any>, fallback: string): Error {
	const message = body['errorInfo'] ?? body['error_description'] ?? fallback
	return new Error(String(message))
}

export async function fetchTestToken(appkey: string, userId: string, password: string): Promise<string> {
	const parts = appkey.trim().split('#')
	if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
		throw new Error('appkey 格式应为 org#app')
	}
	if (userId.trim() === '' || password === '') {
		throw new Error('请填写 userId 和密码')
	}
	const body = await requestJson({
		url: `${EASEMOB_BASE_URL}/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/token`,
		method: 'POST',
		data: {
			grant_type: 'password',
			username: userId.trim(),
			password
		}
	})
	const token = body['access_token']
	if (typeof token !== 'string' || token === '') {
		throw businessError(body, 'token 接口未返回 access_token')
	}
	return token
}

export async function sendLoginSms(phoneNumber: string, encryptedCaptchaVerifyParam: string): Promise<void> {
	if (phoneNumber.trim() === '' || encryptedCaptchaVerifyParam === '') {
		throw new Error('手机号和验证码参数不能为空')
	}
	const body = await requestJson({
		url: `${EASEMOB_BASE_URL}/inside/app/sms/send/v2`,
		method: 'POST',
		data: {
			phoneNumber: phoneNumber.trim(),
			captchaVerifyParam: encryptedCaptchaVerifyParam
		}
	})
	if (body['code'] !== 200) {
		throw businessError(body, '验证码发送失败')
	}
}

export function mapLoginSmsError(info: string): string {
	if (info.includes('phone number illegal')) return '请输入正确的手机号码'
	if (info.includes('Please wait a moment while trying to send.')) return '操作过于频繁，请稍后再试'
	if (info.includes('exceed the limit') || info.includes('SMS verification code exceeds the limit') || info.includes('This request has reached api limit.')) {
		return '验证码获取已达上限，请明日再试'
	}
	return info !== '' ? info : '验证码获取失败'
}

export function mapPhoneLoginError(info: string, phoneNumber: string): string {
	if (info.includes('UserId password error.')) return '用户名或密码错误'
	if (info.includes(`UserId ${phoneNumber} does not exist.`)) return '用户不存在'
	if (info.includes('phone number illegal')) return '请输入正确的手机号码'
	if (info.includes('SMS verification code error.')) return '验证码错误'
	if (info.includes('Sms code cannot be empty')) return '验证码不能为空'
	if (info.includes('Please send SMS to get mobile phone verification code.')) return '请发送短信获取手机验证码'
	return info !== '' ? info : '登录失败，请重试'
}

export async function loginByPhone(phoneNumber: string, smsCode: string): Promise<PhoneLoginResult> {
	if (APP_SERVER_URL === '') {
		throw new Error('App Server 地址未配置')
	}
	if (phoneNumber.trim() === '' || smsCode.trim() === '') {
		throw new Error('手机号和短信验证码不能为空')
	}
	const baseUrl = String(APP_SERVER_URL).replace(/\/+$/, '')
	const body = await requestJson({
		url: `${baseUrl}/inside/app/user/login/V2`,
		method: 'POST',
		data: {
			phoneNumber: phoneNumber.trim(),
			smsCode: smsCode.trim()
		}
	})
	const token = body['token']
	const chatUserName = body['chatUserName']
	if (typeof token !== 'string' || token === '' || typeof chatUserName !== 'string' || chatUserName === '') {
		throw businessError(body, '登录接口未返回有效的 token 和 chatUserName')
	}
	return { token, chatUserName }
}

/**
 * 按手机号查询环信用户 ID（添加联系人时把手机号解析为用户 ID）。
 *
 * GET {appServer}/inside/app/user/{phoneNumber}?operator={当前用户 ID}
 * 鉴权：SDK 登录的 accessToken（Bearer）。
 */
export async function fetchUserIdByPhone(phoneNumber: string, accessToken: string, operator: string): Promise<string> {
	if (APP_SERVER_URL === '') {
		throw new Error('App Server 地址未配置')
	}
	if (phoneNumber.trim() === '' || accessToken === '') {
		throw new Error('手机号或登录凭证不能为空')
	}
	const baseUrl = String(APP_SERVER_URL).replace(/\/+$/, '')
	const body = await requestJson({
		url: `${baseUrl}/inside/app/user/${encodeURIComponent(phoneNumber.trim())}?operator=${encodeURIComponent(operator)}`,
		method: 'GET',
		header: { Authorization: `Bearer ${accessToken}` }
	})
	const chatUserName = (body['chatUserName'] ?? body['data']?.['chatUserName']) as string | undefined
	if (typeof chatUserName !== 'string' || chatUserName === '') {
		throw businessError(body, '该手机号未注册')
	}
	return chatUserName
}

/**
 * 注销账户。
 *
 * DELETE {appServer}/inside/app/user/{phoneNumber}
 * 鉴权：IM 登录返回的 chatToken（Bearer）。
 */
export async function deleteAccount(phoneNumber: string, chatToken: string): Promise<void> {
	if (APP_SERVER_URL === '') {
		throw new Error('App Server 地址未配置')
	}
	if (phoneNumber.trim() === '' || chatToken === '') {
		throw new Error('当前登录模式不支持注销账户')
	}
	const baseUrl = String(APP_SERVER_URL).replace(/\/+$/, '')
	await requestJson({
		url: `${baseUrl}/inside/app/user/${encodeURIComponent(phoneNumber.trim())}`,
		method: 'DELETE',
		header: { Authorization: `Bearer ${chatToken}` }
	})
}

/** 头像上传接口响应 */
export interface AvatarUploadResult {
	avatarUrl: string
}

/**
 * 上传用户头像。
 *
 * POST {appServer}/inside/app/user/{userId}/avatar/upload
 * 鉴权：SDK 登录后的 accessToken（Bearer）。
 */
export function uploadAvatar(userId: string, filePath: string, accessToken: string): Promise<AvatarUploadResult> {
	if (APP_SERVER_URL === '') {
		return Promise.reject(new Error('App Server 地址未配置'))
	}
	const baseUrl = String(APP_SERVER_URL).replace(/\/+$/, '')
	return new Promise<AvatarUploadResult>((resolve, reject) => {
		uni.uploadFile({
			url: `${baseUrl}/inside/app/user/${encodeURIComponent(userId)}/avatar/upload`,
			filePath,
			name: 'file',
			header: { Authorization: `Bearer ${accessToken}` },
			success: (res) => {
				console.info('[avatar] upload response:', res.statusCode, res.data)
				if (res.statusCode < 200 || res.statusCode >= 300) {
					let info = `请求失败（${res.statusCode}）`
					try {
						const body = JSON.parse(res.data) as Record<string, any>
						info = String(body['errorInfo'] ?? body['error_description'] ?? info)
					} catch (e) {}
					reject(new Error(info))
					return
				}
				try {
					const body = JSON.parse(res.data) as Record<string, any>
					const avatarUrl = body['avatarUrl']
					if (typeof avatarUrl !== 'string' || avatarUrl === '') {
						reject(businessError(body, '头像接口未返回有效的 avatarUrl'))
						return
					}
					resolve({ avatarUrl })
				} catch (e) {
					reject(new Error('头像接口返回格式无效'))
				}
			},
			fail: (error) => {
				console.error('[avatar] upload request failed:', error.errMsg)
				reject(new Error(error.errMsg))
			}
		})
	})
}
