// 轻量 Markdown 渲染（对齐 vue3 demo MarkdownStreamMessage 的子集，供 #stream-message 插槽使用）。
// 不引第三方依赖：把 markdown 文本解析为块/行内 run 结构，由 uvue 模板递归消费。
// 支持子集：# ~ ## ~ ###### 标题、- 无序列表、1. 有序列表、``` 代码块、**粗体**、*斜体*、`行内代码`、[text](url) 链接、> 引用、--- 分隔线。

export interface MdRun {
	text: string
	bold?: boolean
	italic?: boolean
	code?: boolean
	link?: string
}

export interface MdBlock {
	type: 'h' | 'p' | 'li' | 'code' | 'quote' | 'hr'
	level?: number   // h: 1-6
	ordered?: boolean
	runs?: MdRun[]
	text?: string    // code 块全文
}

function parseInline(text: string): MdRun[] {
	const runs: MdRun[] = []
	// 行内优先级：行内代码 > 链接 > 粗体 > 斜体；用单次扫描按出现顺序切分
	const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g
	let last = 0
	let match: RegExpExecArray | null
	while ((match = pattern.exec(text)) != null) {
		if (match.index > last) {
			runs.push({ text: text.slice(last, match.index) })
		}
		const token = match[0]
		if (match[1] != null) {
			runs.push({ text: token.slice(1, -1), code: true })
		} else if (match[2] != null) {
			const inner = token.match(/\[([^\]]+)\]\(([^)]+)\)/)
			if (inner != null) {
				runs.push({ text: inner[1]!, link: inner[2]! })
			} else {
				runs.push({ text: token })
			}
		} else if (match[3] != null) {
			runs.push({ text: token.slice(2, -2), bold: true })
		} else {
			runs.push({ text: token.slice(1, -1), italic: true })
		}
		last = match.index + token.length
	}
	if (last < text.length) {
		runs.push({ text: text.slice(last) })
	}
	return runs
}

export function parseMarkdown(source: string): MdBlock[] {
	const blocks: MdBlock[] = []
	const lines = source.replace(/\r\n/g, '\n').split('\n')
	let i = 0
	while (i < lines.length) {
		const line = lines[i]!
		const trimmed = line.trim()

		// 代码块
		if (trimmed.indexOf('```') === 0) {
			const buf: string[] = []
			i++
			while (i < lines.length && lines[i]!.trim().indexOf('```') !== 0) {
				buf.push(lines[i]!)
				i++
			}
			i++   // 跳过收尾 ```（或文件结尾）
			blocks.push({ type: 'code', text: buf.join('\n') })
			continue
		}

		if (trimmed === '') {
			i++
			continue
		}

		// 分隔线
		if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
			blocks.push({ type: 'hr' })
			i++
			continue
		}

		// 标题
		const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
		if (heading != null) {
			blocks.push({ type: 'h', level: heading[1]!.length, runs: parseInline(heading[2]!) })
			i++
			continue
		}

		// 引用
		if (trimmed.indexOf('> ') === 0) {
			blocks.push({ type: 'quote', runs: parseInline(trimmed.slice(2)) })
			i++
			continue
		}

		// 无序/有序列表（连续行合并为多个 li 块）
		const ul = trimmed.match(/^[-*]\s+(.*)$/)
		const ol = trimmed.match(/^\d+[.、]\s*(.*)$/)
		if (ul != null || ol != null) {
			blocks.push({ type: 'li', ordered: ol != null, runs: parseInline((ul ?? ol)![1]!) })
			i++
			continue
		}

		// 段落：合并到下一个空行/块级语法前
		const buf: string[] = [trimmed]
		i++
		while (i < lines.length) {
			const next = lines[i]!.trim()
			if (
				next === '' ||
				next.indexOf('```') === 0 ||
				/^(#{1,6})\s/.test(next) ||
				next.indexOf('> ') === 0 ||
				/^[-*]\s+/.test(next) ||
				/^\d+[.、]\s*/.test(next) ||
				/^(-{3,}|\*{3,})$/.test(next)
			) {
				break
			}
			buf.push(next)
			i++
		}
		blocks.push({ type: 'p', runs: parseInline(buf.join(' ')) })
	}
	return blocks
}
