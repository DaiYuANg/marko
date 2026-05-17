import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/i18n/resources'
import { getInitialLocale } from '@/i18n/utils'

export type ViewMode = 'wysiwyg' | 'source' | 'graph'
export type ThemeMode = 'light' | 'dark' | 'marko-light' | 'marko-dark'

export type FileEntry = {
  path: string
  kind: 'file' | 'folder'
}

type AppState = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  recentProjects: string[]
  entries: FileEntry[]
  tabs: string[]
  activePath: string | null
  viewMode: ViewMode
  theme: ThemeMode
  locale: Locale
  sidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  silentSave: boolean
  showEditorStatusBar: boolean
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external' | 'single') => void
  setEntries: (entries: FileEntry[]) => void
  setTabs: (tabs: string[]) => void
  setActivePath: (path: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: ThemeMode) => void
  setLocale: (locale: Locale) => void
  setSilentSave: (silent: boolean) => void
  setShowEditorStatusBar: (show: boolean) => void
  toggleSidebar: () => void
  toggleRightSidebar: () => void
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
      viewMode: 'wysiwyg',
      theme: 'marko-light',
      locale: getInitialLocale(),
      sidebarCollapsed: false,
      rightSidebarCollapsed: false,
      silentSave: true,
      showEditorStatusBar: true,
      setRootPath: (path) => set({ rootPath: path }),
      setRootKind: (kind) => set({ rootKind: kind }),
      setEntries: (entries) => set({ entries }),
      setTabs: (tabs) => set({ tabs }),
      setActivePath: (path) => set({ activePath: path }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setSilentSave: (silentSave) => set({ silentSave }),
      setShowEditorStatusBar: (showEditorStatusBar) => set({ showEditorStatusBar }),
      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),
      toggleRightSidebar: () =>
        set((state) => ({
          rightSidebarCollapsed: !state.rightSidebarCollapsed,
        })),
      touchRecentProject: (path) =>
        set((state) => {
          const next = [path, ...state.recentProjects.filter((p) => p !== path)]
          return { recentProjects: next.slice(0, 8) }
        }),
    }),
    {
      name: 'marko.app',
      version: 6,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<AppState> & { theme?: string }
        const legacyTheme =
          version < 6 && state.theme === 'light'
            ? 'marko-light'
            : version < 6 && state.theme === 'dark'
              ? 'marko-dark'
              : state.theme
        const normalizedTheme: ThemeMode =
          legacyTheme === 'light' ||
          legacyTheme === 'dark' ||
          legacyTheme === 'marko-light' ||
          legacyTheme === 'marko-dark'
            ? (legacyTheme as ThemeMode)
            : 'marko-light'
        const normalizedViewMode: ViewMode =
          state.viewMode === 'graph' || state.viewMode === 'source' ? state.viewMode : 'wysiwyg'
        return {
          ...state,
          theme: normalizedTheme,
          viewMode: normalizedViewMode,
          rightSidebarCollapsed: state.rightSidebarCollapsed ?? false,
          silentSave: state.silentSave ?? true,
          showEditorStatusBar: state.showEditorStatusBar ?? true,
        } as AppState
      },
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
        rightSidebarCollapsed: state.rightSidebarCollapsed,
        silentSave: state.silentSave,
        showEditorStatusBar: state.showEditorStatusBar,
      }),
    },
  ),
)
