const AVATAR_MAX_DIMENSION = 512
const AVATAR_COMPRESS_QUALITY = 80

export function compressAvatarImage(filePath: string): Promise<string> {
	// #ifndef APP
	return Promise.resolve(filePath)
	// #endif
	// #ifdef APP
	return new Promise<string>((resolve) => {
		try {
			uni.getImageInfo({
				src: filePath,
				success: (info) => {
					try {
						console.info('[avatar] image info:', info.width, info.height)
						const maxDimension = Math.max(info.width, info.height)
						if (maxDimension <= AVATAR_MAX_DIMENSION) {
							resolve(filePath)
							return
						}
						const scale = AVATAR_MAX_DIMENSION / maxDimension
						uni.compressImage({
							src: filePath,
							compressedWidth: Math.max(1, Math.round(info.width * scale)),
							compressedHeight: Math.max(1, Math.round(info.height * scale)),
							quality: AVATAR_COMPRESS_QUALITY,
							success: (res) => {
								console.info('[avatar] compress output:', res.tempFilePath)
								resolve(res.tempFilePath)
							},
							fail: (e) => {
								console.warn('[avatar] compress failed, use original:', e)
								resolve(filePath)
							}
						})
					} catch (e) {
						console.warn('[avatar] compress exception, use original:', e)
						resolve(filePath)
					}
				},
				fail: (e) => {
					console.warn('[avatar] image info failed, use original:', e)
					resolve(filePath)
				}
			})
		} catch (e) {
			console.warn('[avatar] image info exception, use original:', e)
			resolve(filePath)
		}
	})
	// #endif
}
