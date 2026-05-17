import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/useAppStore'

export const useWorkspaceStoreSlice = () =>
  useAppStore(
    useShallow((state) => ({
      rootPath: state.rootPath,
      rootKind: state.rootKind,
      recentProjects: state.recentProjects,
      entries: state.entries,
      tabs: state.tabs,
      activePath: state.activePath,
      setRootPath: state.setRootPath,
      setRootKind: state.setRootKind,
      setEntries: state.setEntries,
      setTabs: state.setTabs,
      setActivePath: state.setActivePath,
      touchRecentProject: state.touchRecentProject,
    })),
  )

export const useLayoutStoreSlice = () =>
  useAppStore(
    useShallow((state) => ({
      sidebarCollapsed: state.sidebarCollapsed,
      rightSidebarCollapsed: state.rightSidebarCollapsed,
      theme: state.theme,
      silentSave: state.silentSave,
      showEditorStatusBar: state.showEditorStatusBar,
      toggleSidebar: state.toggleSidebar,
      toggleRightSidebar: state.toggleRightSidebar,
      setTheme: state.setTheme,
    })),
  )

export const useGraphLayoutStoreSlice = () =>
  useAppStore(
    useShallow((state) => ({
      graphLayouts: state.graphLayouts,
      setGraphNodePosition: state.setGraphNodePosition,
    })),
  )
