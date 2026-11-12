function nonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

export function resolveLoginExtensionInfo(info: Record<string, unknown>): string {
  const deviceName = nonEmptyString(info.platform) || nonEmptyString(info.osName) || 'unknown'
  return JSON.stringify({ deviceName })
}
