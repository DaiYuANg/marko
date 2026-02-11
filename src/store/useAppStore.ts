import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'editor' | 'graph'
export type ThemeMode = 'warm' | 'light' | 'dark'

export type MarkdownFile = {
  path: string
  relative_path: string
}

type AppState = {
  projectPath: string
  recentProjects: string[]
  files: MarkdownFile[]
  tabs: string[]
  activePath: string | null
  viewMode: ViewMode
  theme: ThemeMode
  sidebarCollapsed: boolean
  setProjectPath: (path: string) => void
  setFiles: (files: MarkdownFile[]) => void
  setTabs: (tabs: string[]) => void
  setActivePath: (path: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: ThemeMode) => void
  toggleSidebar: () => void
  touchRecentProject: (path: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      projectPath: '',
      recentProjects: [],
      files: [],
      tabs: [],
      activePath: null,
      viewMode: 'editor',
      theme: 'warm',
      sidebarCollapsed: false,
      setProjectPath: (path) => set({ projectPath: path }),
      setFiles: (files) => set({ files }),
      setTabs: (tabs) => set({ tabs }),
      setActivePath: (path) => set({ activePath: path }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setTheme: (theme) => set({ theme }),
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
      name: 'mdmind.app',
      partialize: (state) => ({
        projectPath: state.projectPath,
        recentProjects: state.recentProjects,
        tabs: state.tabs,
        activePath: state.activePath,
        viewMode: state.viewMode,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
)
