import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/i18n/resources'
import { getInitialLocale } from '@/i18n/utils'

export type ViewMode = 'editor' | 'graph'
export type ThemeMode = 'warm' | 'light' | 'dark'

export type FileEntry = {
  path: string
  kind: 'file' | 'folder'
}

type AppState = {
  rootPath: string
  rootKind: 'internal' | 'external'
  recentProjects: string[]
  entries: FileEntry[]
  tabs: string[]
  activePath: string | null
  viewMode: ViewMode
  theme: ThemeMode
  locale: Locale
  sidebarCollapsed: boolean
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external') => void
  setEntries: (entries: FileEntry[]) => void
  setTabs: (tabs: string[]) => void
  setActivePath: (path: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: ThemeMode) => void
  setLocale: (locale: Locale) => void
  toggleSidebar: () => void
  touchRecentProject: (path: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      rootPath: '',
      rootKind: 'internal',
      recentProjects: [],
      entries: [],
      tabs: [],
      activePath: null,
      viewMode: 'editor',
      theme: 'warm',
      locale: getInitialLocale(),
      sidebarCollapsed: false,
      setRootPath: (path) => set({ rootPath: path }),
      setRootKind: (kind) => set({ rootKind: kind }),
      setEntries: (entries) => set({ entries }),
      setTabs: (tabs) => set({ tabs }),
      setActivePath: (path) => set({ activePath: path }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),
      touchRecentProject: (path) =>
        set((state) => {
          const next = [path, ...state.recentProjects.filter((p) => p !== path)]
          return { recentProjects: next.slice(0, 8) }
        }),
    }),
    {
      name: 'marko.app',
      partialize: (state) => ({
        rootPath: state.rootPath,
        rootKind: state.rootKind,
        recentProjects: state.recentProjects,
        tabs: state.tabs,
        activePath: state.activePath,
        viewMode: state.viewMode,
        theme: state.theme,
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
)
