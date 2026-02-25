import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import Titlebar from '@/components/Titlebar'
import TabsBar from '@/components/TabsBar'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import type { GraphData } from '@/logic/graph'
import type { FileEntry, ThemeMode } from '@/store/useAppStore'
import { useEffect, useMemo } from 'react'

export type LayoutContext = {
  activePath: string | null
  editorValue: string
  graph: GraphData
  onEditorChange: (value: string) => void
  onOpenFile: (path: string) => void
  getSlugForPath: (path: string) => string
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  slugToPath: Map<string, string>
  files: FileEntry[]
}

export default function AppLayout() {
  const state = useAppLayoutState()

  // memoize the context object so that consumers (routes) don't re-render
  // on every layout update; only when the referenced values actually change.
  const outletContext = useMemo(() => {
    return {
      activePath: state.activePath,
      editorValue: state.editorValue,
      graph: state.graph,
      onEditorChange: state.onEditorChange,
      onOpenFile: state.onOpenFile,
      getSlugForPath: (path: string) => state.routeMaps.pathToSlug.get(path) ?? path,
      theme: state.theme,
      setTheme: state.setTheme,
      slugToPath: state.routeMaps.slugToPath,
      files: state.files,
    } as LayoutContext
  }, [
    state.activePath,
    state.editorValue,
    state.graph,
    state.onEditorChange,
    state.onOpenFile,
    state.routeMaps,
    state.theme,
    state.setTheme,
    state.files,
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

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        onToggleSidebar={state.toggleSidebar}
        onToggleRightSidebar={state.toggleRightSidebar}
        onSelectProject={state.onSelectProject}
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
        />
        <section className="flex flex-1 flex-col overflow-hidden">
          <TabsBar
            tabs={state.tabs}
            activePath={state.activePath}
            onOpenFile={state.onOpenFile}
            onCloseTab={state.onCloseTab}
            pathToSlug={state.routeMaps.pathToSlug}
            slugToPath={state.routeMaps.slugToPath}
          />
          <div className="flex-1 overflow-hidden bg-background">
            <Outlet context={outletContext} />
          </div>
        </section>
        <RightSidebar
          collapsed={state.rightSidebarCollapsed}
          activePath={state.activePath}
          tabs={state.tabs}
          totalFiles={state.files.filter((file) => file.kind === 'file').length}
          onOpenFile={state.onOpenFile}
        />
      </div>
    </div>
  )
}
