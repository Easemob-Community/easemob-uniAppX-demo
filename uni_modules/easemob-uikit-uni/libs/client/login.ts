import type { EmLoginOptions } from '../types'

export function normalizeLoginOptions(
  options: EmLoginOptions,
  warn: (message: string) => void
): EmLoginOptions {
  const hasUppercase = /[A-Z]/.test(options.userId)
  if (!hasUppercase) {
    return { userId: options.userId, token: options.token }
  }
  const userId = options.userId.toLowerCase()
  warn(`login userId 包含大写英文字母，将强制转小写：${options.userId} -> ${userId}；请勿使用大写英文字母 A-Z`)
  return { userId, token: options.token }
}
