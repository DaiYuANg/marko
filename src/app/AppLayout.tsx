import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import Titlebar from '@/components/Titlebar'
import TabsBar from '@/components/TabsBar'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import type { GraphData } from '@/logic/graph'
import type { FileEntry, ThemeMode, ViewMode } from '@/store/useAppStore'
import { useEffect, useMemo } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

export type LayoutContext = {
  activePath: string | null
  editorValue: string
  graph: GraphData
  onEditorChange: (value: string) => void
  onOpenFile: (path: string) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  files: FileEntry[]
  currentView: ViewMode
  onChangeView: (mode: ViewMode) => void
}

export default function AppLayout() {
  const state = useAppLayoutState()
  const totalFiles = useMemo(
    () => state.files.reduce((count, file) => count + (file.kind === 'file' ? 1 : 0), 0),
    [state.files],
  )

  // memoize the context object so that consumers (routes) don't re-render
  // on every layout update; only when the referenced values actually change.
  const outletContext = useMemo(() => {
    return {
      activePath: state.activePath,
      editorValue: state.editorValue,
      graph: state.graph,
      onEditorChange: state.onEditorChange,
      onOpenFile: state.onOpenFile,
      theme: state.theme,
      setTheme: state.setTheme,
      files: state.files,
      currentView: state.viewMode,
      onChangeView: state.setViewMode,
    } as LayoutContext
  }, [
    state.activePath,
    state.editorValue,
    state.graph,
    state.onEditorChange,
    state.onOpenFile,
    state.theme,
    state.setTheme,
    state.files,
    state.viewMode,
    state.setViewMode,
  ])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
    if (!isTauri) {
      return
    }
    void import('@tauri-apps/api/event').then(({ emit }) => emit('app-ready'))
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    const flushOnClose = () => {
      void invoke('fs_flush_buffers')
    }
    window.addEventListener('beforeunload', flushOnClose)
    return () => {
      window.removeEventListener('beforeunload', flushOnClose)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        onToggleSidebar={state.toggleSidebar}
        onToggleRightSidebar={state.toggleRightSidebar}
        onSelectProject={state.onSelectProject}
        onSelectSingleFile={state.onSelectSingleFile}
        isMaximized={state.isMaximized}
        setIsMaximized={state.setIsMaximized}
        theme={state.theme}
        setTheme={state.setTheme}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={state.sidebarCollapsed}
          recentProjects={state.recentProjects}
          files={state.files}
          fileTree={state.fileTree}
          onOpenFile={state.onOpenFile}
          onOpenProject={state.onOpenProject}
          onCreateFile={state.createFile}
          onCreateFolder={state.createFolder}
          onRenamePath={state.renamePath}
          onDeletePath={state.deletePath}
          onUseInternalRoot={state.onUseInternalRoot}
          rootKind={state.rootKind}
          onInspectPath={state.onInspectPath}
        />
        <section className="flex flex-1 flex-col overflow-hidden">
          <TabsBar
            tabs={state.tabs}
            activePath={state.activePath}
            onOpenFile={state.onOpenFile}
            onCloseTab={state.onCloseTab}
            viewMode={state.viewMode}
            onChangeView={state.setViewMode}
          />
          <div className="flex-1 overflow-hidden bg-background">
            <Outlet context={outletContext} />
          </div>
        </section>
        <RightSidebar
          collapsed={state.rightSidebarCollapsed}
          activePath={state.activePath}
          tabs={state.tabs}
          totalFiles={totalFiles}
          onOpenFile={state.onOpenFile}
          viewMode={state.viewMode}
          onChangeView={state.setViewMode}
          inspectedPath={state.inspectedPath}
        />
      </div>
    </div>
  )
}
