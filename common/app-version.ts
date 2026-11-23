export function getDemoVersion(): string {
	const info = uni.getAppBaseInfo()
	return info.appWgtVersion || info.appVersion || '-'
}
