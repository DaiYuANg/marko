import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/i18n/resources'
import { getInitialLocale } from '@/i18n/utils'
import { createIdleJsonStorage } from '@/store/persistStorage'

export type ViewMode = 'wysiwyg' | 'source' | 'graph'
export type ThemeMode = 'light' | 'dark' | 'marko-light' | 'marko-dark'

export type FileEntry = {
  path: string
  kind: 'file' | 'folder'
}

export type GraphNodePosition = {
  x: number
  y: number
}

export type GraphLayoutPositions = Record<string, GraphNodePosition>

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
  graphLayouts: Record<string, GraphLayoutPositions>
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
  setGraphNodePosition: (layoutKey: string, nodeId: string, position: GraphNodePosition) => void
  toggleSidebar: () => void
  toggleRightSidebar: () => void
  touchRecentProject: (path: string) => void
}

const equalStringArrays = (left: string[], right: string[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
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
      graphLayouts: {},
      setRootPath: (path) => set((state) => (state.rootPath === path ? state : { rootPath: path })),
      setRootKind: (kind) => set((state) => (state.rootKind === kind ? state : { rootKind: kind })),
      setEntries: (entries) => set((state) => (state.entries === entries ? state : { entries })),
      setTabs: (tabs) => set((state) => (equalStringArrays(state.tabs, tabs) ? state : { tabs })),
      setActivePath: (path) =>
        set((state) => (state.activePath === path ? state : { activePath: path })),
      setViewMode: (mode) => set((state) => (state.viewMode === mode ? state : { viewMode: mode })),
      setTheme: (theme) => set((state) => (state.theme === theme ? state : { theme })),
      setLocale: (locale) => set((state) => (state.locale === locale ? state : { locale })),
      setSilentSave: (silentSave) =>
        set((state) => (state.silentSave === silentSave ? state : { silentSave })),
      setShowEditorStatusBar: (showEditorStatusBar) =>
        set((state) =>
          state.showEditorStatusBar === showEditorStatusBar ? state : { showEditorStatusBar },
        ),
      setGraphNodePosition: (layoutKey, nodeId, position) =>
        set((state) => {
          const currentLayout = state.graphLayouts[layoutKey] ?? {}
          const currentPosition = currentLayout[nodeId]
          if (currentPosition?.x === position.x && currentPosition.y === position.y) {
            return state
          }
          return {
            graphLayouts: {
              ...state.graphLayouts,
              [layoutKey]: {
                ...currentLayout,
                [nodeId]: position,
              },
            },
          }
        }),
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
      storage: createIdleJsonStorage('marko.app'),
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
          graphLayouts: state.graphLayouts ?? {},
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
        graphLayouts: state.graphLayouts,
      }),
    },
  ),
)
