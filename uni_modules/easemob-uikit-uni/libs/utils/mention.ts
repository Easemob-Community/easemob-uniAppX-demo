// @提及纯函数工具（对齐 vue 版 utils/mention.ts 与 text-message 分片逻辑）：
// filterActiveMentions 发送前过滤已失效的 @（防已删成员/被改文本进入 ext em_at_list）；
// parseMentions 返回 @ 片段区间供气泡高亮分片。
import type { MentionContact } from '../types'

/** @名字组成部分：字母/数字/下划线/中文/@ */
const NAME_CHAR = /[\w@一-龥]/

/**
 * 过滤出仍真实出现在文本中的 @提及（发送前兜底，防止已删除的 @ 进入 ext.em_at_list）。
 *
 * mentionList 与输入文本是解耦维护的：用户删除/修改 @ 文本后列表不会同步清理。
 * 发送前用本函数做精确匹配 —— `@name` 后必须是行尾或非名字字符，
 * 避免 `@张三` 误匹配到 `@张三丰`（前缀误判）；前面也不能是 `@`（避免 `@@张三`）。
 */
export function filterActiveMentions(text: string, mentionList: MentionContact[]): MentionContact[] {
  if (text === '' || mentionList.length === 0) {
    return []
  }
  return mentionList.filter((m) => {
    if (m.name === '') {
      return false
    }
    const at = `@${m.name}`
    let idx = text.indexOf(at)
    while (idx >= 0) {
      const before = idx > 0 ? text[idx - 1] : ''
      const after = text[idx + at.length]
      if (before !== '@' && (after === undefined || !NAME_CHAR.test(after))) {
        return true
      }
      idx = text.indexOf(at, idx + 1)
    }
    return false
  })
}

/** @ 片段区间（[start, end) 半开，name 不含 @ 前缀），供气泡文本高亮分片 */
export interface EmMentionSegment {
  start: number
  end: number
  name: string
}

/** 解析文本中的全部 @ 片段（对齐 vue 版 text-message 的 @(\S+) 识别规则，按出现顺序返回） */
export function parseMentions(text: string): EmMentionSegment[] {
  if (text === '') {
    return []
  }
  const segments: EmMentionSegment[] = []
  const atRegex = /@(\S+)/g
  let match = atRegex.exec(text)
  while (match !== null) {
    segments.push({
      start: match.index,
      end: match.index + match[0].length,
      name: match[1]
    })
    match = atRegex.exec(text)
  }
  return segments
}
