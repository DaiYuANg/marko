import { invoke } from '@tauri-apps/api/core'

export type AppPlatform = 'windows' | 'linux' | 'macos' | 'unknown'

function normalizePlatform(raw: string): AppPlatform {
  if (raw === 'windows' || raw === 'linux' || raw === 'macos') return raw
  return 'unknown'
}

export const appApi = {
  async getPlatform() {
    const result = await invoke<string>('app_get_platform')
    return normalizePlatform(result)
  },
  menuDispatch(id: string) {
    return invoke('menu_dispatch', { id })
  },
}
