import { isTauri } from '@tauri-apps/api/core'
import type { AppPlatform } from '@/services/appApi'

export function isTauriRuntime() {
  return isTauri()
}

export async function runInTauri<T>(callback: () => Promise<T> | T) {
  if (!isTauriRuntime()) return null
  return callback()
}

export function inferPlatformFromUserAgent(): AppPlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}
