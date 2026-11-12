import type {
  CreatePlatformAdapterOptions,
  ManagerRegistration,
  PlatformAdapterOverridesResolver
} from 'easemob-websdk'
import type { EmKitConfig, EmSdkInitOptions } from '../types'
import type { SdkDeviceInfo } from './device'

const DEFAULT_ENABLE_SYNC_DATA: NonNullable<EmSdkInitOptions['enableSyncData']> = [
  'conversation',
  'contact',
  'group'
]

let cachedBaseOverrides: PlatformAdapterOverridesResolver | null = null
let cachedCustomOverrides: CreatePlatformAdapterOptions['overrides'] = undefined
let cachedComposedOverrides: PlatformAdapterOverridesResolver | null = null

function composePlatformOverrides(
  platformOverrides: PlatformAdapterOverridesResolver,
  customOverrides: CreatePlatformAdapterOptions['overrides']
): PlatformAdapterOverridesResolver {
  if (
    cachedComposedOverrides !== null &&
    cachedBaseOverrides === platformOverrides &&
    cachedCustomOverrides === customOverrides
  ) {
    return cachedComposedOverrides
  }
  const composed: PlatformAdapterOverridesResolver = (defaults) => {
    const hostOverrides = typeof customOverrides === 'function'
      ? customOverrides(defaults)
      : customOverrides
    return {
      ...platformOverrides(defaults),
      ...hostOverrides
    }
  }
  cachedBaseOverrides = platformOverrides
  cachedCustomOverrides = customOverrides
  cachedComposedOverrides = composed
  return composed
}

export function resolveSdkInitOptions(
  config: EmKitConfig,
  deviceInfo: SdkDeviceInfo,
  requiredManagers: ReadonlyArray<ManagerRegistration<unknown>>,
  platformOverrides: PlatformAdapterOverridesResolver
): EmSdkInitOptions {
  const custom = config.sdkInitOptions ?? {}
  const managers = requiredManagers.slice()
  custom.managers?.forEach((manager) => {
    if (managers.indexOf(manager) < 0) managers.push(manager)
  })

  const customPlatformOptions = custom.platformAdapterOptions
  const customOverrides = customPlatformOptions?.overrides
  const platformAdapterOptions: CreatePlatformAdapterOptions = {
    ...customPlatformOptions,
    overrides: composePlatformOverrides(platformOverrides, customOverrides)
  }

  return {
    ...deviceInfo,
    ...custom,
    enableSyncData: custom.enableSyncData ?? DEFAULT_ENABLE_SYNC_DATA,
    managers,
    platformAdapterOptions
  }
}
