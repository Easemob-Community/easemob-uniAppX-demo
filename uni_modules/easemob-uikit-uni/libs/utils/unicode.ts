function isCombiningMark(cp: number): boolean {
  return (cp >= 0x0300 && cp <= 0x036f)
    || (cp >= 0x0610 && cp <= 0x061a)
    || (cp >= 0x064b && cp <= 0x065f)
    || cp === 0x0670
    || (cp >= 0x06d6 && cp <= 0x06ed)
    || (cp >= 0x0900 && cp <= 0x0903)
    || (cp >= 0x093a && cp <= 0x094f)
    || (cp >= 0x0951 && cp <= 0x0957)
    || (cp >= 0x0962 && cp <= 0x0963)
    || (cp >= 0x1ab0 && cp <= 0x1aff)
    || (cp >= 0x1dc0 && cp <= 0x1dff)
    || (cp >= 0x20d0 && cp <= 0x20ff)
    || (cp >= 0xfe20 && cp <= 0xfe2f)
}

type HangulType = 'L' | 'V' | 'T' | 'LV' | 'LVT' | ''

function hangulTypeOf(cp: number): HangulType {
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0xa960 && cp <= 0xa97c)) return 'L'
  if ((cp >= 0x1160 && cp <= 0x11a7) || (cp >= 0xd7b0 && cp <= 0xd7c6)) return 'V'
  if ((cp >= 0x11a8 && cp <= 0x11ff) || (cp >= 0xd7cb && cp <= 0xd7fb)) return 'T'
  if (cp >= 0xac00 && cp <= 0xd7a3) return (cp - 0xac00) % 28 === 0 ? 'LV' : 'LVT'
  return ''
}

function isHangulJoin(previousCp: number, cp: number): boolean {
  const previous = hangulTypeOf(previousCp)
  const current = hangulTypeOf(cp)
  if (previous === 'L') return current === 'L' || current === 'V' || current === 'LV' || current === 'LVT'
  if (previous === 'LV' || previous === 'V') return current === 'V' || current === 'T'
  return (previous === 'LVT' || previous === 'T') && current === 'T'
}

function isVariationSelector(cp: number): boolean {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)
}

function isEmojiModifier(cp: number): boolean {
  return cp >= 0x1f3fb && cp <= 0x1f3ff
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

function isTag(cp: number): boolean {
  return (cp >= 0xe0020 && cp <= 0xe007e) || cp === 0xe007f
}

export function removeLastGrapheme(value: string): string {
  if (value === '') return ''

  let index = 0
  let previousCp = -1
  let lastClusterStart = 0
  let regionalRun = 0
  let joinNext = false

  while (index < value.length) {
    const cp = value.codePointAt(index) as number
    const extendsPrevious = cp === 0x200d
      || isCombiningMark(cp)
      || isVariationSelector(cp)
      || isEmojiModifier(cp)
      || isTag(cp)
    const joinsPrevious = joinNext || extendsPrevious || isHangulJoin(previousCp, cp) || (cp === 0x0a && previousCp === 0x0d)
    let startsNew = index > 0 && !joinsPrevious

    if (isRegionalIndicator(cp) && regionalRun % 2 === 1 && !joinNext) {
      startsNew = false
    }
    if (startsNew) lastClusterStart = index

    regionalRun = isRegionalIndicator(cp) ? regionalRun + 1 : 0
    joinNext = cp === 0x200d
    previousCp = cp
    index += cp > 0xffff ? 2 : 1
  }

  return value.slice(0, lastClusterStart)
}
