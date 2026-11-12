// 业务资料注入：SDK UserInfo 已返回但昵称为空的用户（含自己），向 uikit 回落链注入兜底展示值
// （EmKit.setUserPresentation，优先级最高）。只补空不覆盖：已有 SDK 资料的用户完全不动，
// 避免注入值遮蔽后续服务端资料回推（SDK 回推只写 infoByUserId，永不触碰 override）。
// 头像为空的用户不注入图片兜底：留空由 uikit em-avatar 回落文本头像（昵称首字符 + hash 底色），
// 注入横幅类图片会被圆形头像 aspectFill 裁切放大，显示成不可辨认的花字。
// 好友资料在通讯录/会话同步后由页面 onShow 调 fillMissingProfiles() 批量补齐。
import { EmKit, userStore } from '@/uni_modules/easemob-uikit-uni/libs'

export function fillMissingProfiles(): void {
	const infos = userStore.infoByUserId
	if (infos == null) return
	Object.keys(infos).forEach((userId) => {
		const info = infos[userId]
		if (info == null) return
		const nickname = (info.nickname ?? '').trim()
		if (nickname === '') {
			EmKit.setUserPresentation(userId, { nickname: userId })
		}
	})
}
