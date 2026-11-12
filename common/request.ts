import { REQUEST_TIMEOUT } from './config'

export interface RequestOptions {
	url: string
	method: 'GET' | 'POST' | 'DELETE'
	data?: Record<string, any>
	header?: Record<string, string>
	timeout?: number
}

function responseError(body: Record<string, any>, fallback: string): Error {
	const message = body['errorInfo'] ?? body['error_description'] ?? fallback
	return new Error(String(message))
}

export function requestJson(options: RequestOptions): Promise<Record<string, any>> {
	return new Promise<Record<string, any>>((resolve, reject) => {
		uni.request({
			url: options.url,
			method: options.method,
			data: options.data ?? {},
			header: options.header ?? { 'Content-Type': 'application/json' },
			timeout: options.timeout ?? REQUEST_TIMEOUT,
			success: (res) => {
				const raw = res.data
				if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
					reject(new Error('服务返回格式无效'))
					return
				}
				const body = raw as Record<string, any>
				if (res.statusCode < 200 || res.statusCode >= 300) {
					reject(responseError(body, `请求失败（${res.statusCode}）`))
					return
				}
				resolve(body)
			},
			fail: (error) => {
				reject(new Error(error.errMsg))
			}
		})
	})
}
