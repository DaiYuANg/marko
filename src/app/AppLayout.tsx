import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Titlebar from '@/components/Titlebar'
import TabsBar from '@/components/TabsBar'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import type { GraphData } from '@/logic/graph'
import type { ThemeMode } from '@/store/useAppStore'
import { useEffect } from 'react'

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
  files: { relative_path: string }[]
}

export default function AppLayout() {
  const state = useAppLayoutState()

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        sidebarCollapsed={state.sidebarCollapsed}
        onToggleSidebar={state.toggleSidebar}
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
        />
        <section className="flex flex-1 flex-col overflow-hidden">
          <TabsBar
            tabs={state.tabs}
            onOpenFile={state.onOpenFile}
            onCloseTab={state.onCloseTab}
            pathToSlug={state.routeMaps.pathToSlug}
            slugToPath={state.routeMaps.slugToPath}
          />
          <div className="flex-1 overflow-hidden bg-background">
            <Outlet
              context={{
                activePath: state.activePath,
                editorValue: state.editorValue,
                graph: state.graph,
                onEditorChange: state.onEditorChange,
                onOpenFile: state.onOpenFile,
                getSlugForPath: (path: string) =>
                  state.routeMaps.pathToSlug.get(path) ?? path,
                theme: state.theme,
                setTheme: state.setTheme,
                slugToPath: state.routeMaps.slugToPath,
                files: state.files,
              } satisfies LayoutContext}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
