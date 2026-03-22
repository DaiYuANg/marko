import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import Titlebar from '@/components/Titlebar'
import TabsBar from '@/components/TabsBar'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import type { GraphData } from '@/logic/graph'
import type { FileEntry, ThemeMode, ViewMode } from '@/store/useAppStore'
import { useEffect, useMemo, useRef } from 'react'
import { exportApi } from '@/services/exportApi'
import { fsApi } from '@/services/fsApi'
import { requestExportContent } from '@/utils/exportContent'
import { isTauriRuntime } from '@/utils/tauri'

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
}

export default function AppLayout() {
  const state = useAppLayoutState()

  // Ref for export: always use latest active tab (avoids stale closure when menu opens)
  const exportStateRef = useRef({
    activePath: state.activePath,
    rootPath: state.rootPath,
    editorValue: state.editorValue,
  })
  exportStateRef.current = {
    activePath: state.activePath,
    rootPath: state.rootPath,
    editorValue: state.editorValue,
  }

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
    if (!isTauriRuntime()) return
    const flushOnClose = () => {
      void fsApi.flushBuffers()
    }
    window.addEventListener('beforeunload', flushOnClose)
    return () => {
      window.removeEventListener('beforeunload', flushOnClose)
    }
  }, [])

  useEffect(() => {
    const executeEdit = (action: string) => {
      if (typeof document === 'undefined') return
      if (action === 'edit.undo') document.execCommand('undo')
      if (action === 'edit.redo') document.execCommand('redo')
      if (action === 'edit.cut') document.execCommand('cut')
      if (action === 'edit.copy') document.execCommand('copy')
      if (action === 'edit.paste') document.execCommand('paste')
      if (action === 'edit.select_all') document.execCommand('selectAll')
    }

    const createUntitledPath = () => {
      const files = new Set(
        state.files
          .filter((entry) => entry.kind === 'file')
          .map((entry) => entry.path.toLowerCase()),
      )
      if (!files.has('untitled.md')) return 'Untitled.md'
      for (let index = 1; index <= 999; index += 1) {
        const next = `Untitled-${index}.md`
        if (!files.has(next.toLowerCase())) return next
      }
      return `Untitled-${Date.now()}.md`
    }

    const handleMenuAction = (id: string) => {
      if (id.startsWith('edit.')) {
        executeEdit(id)
        return
      }
      if (id === 'file.open_project') {
        void state.onSelectProject()
        return
      }
      if (id === 'file.open_file') {
        void state.onSelectSingleFile()
        return
      }
      if (id === 'file.new') {
        const next = createUntitledPath()
        void state.createFile(next).then(() => state.onOpenFile(next))
        return
      }
      if (id === 'file.export_pdf' || id === 'file.export_docx' || id === 'file.export_html') {
        if (!isTauriRuntime()) return
        const format =
          id === 'file.export_pdf' ? 'pdf' : id === 'file.export_docx' ? 'docx' : 'html'
        const { activePath, rootPath, editorValue } = exportStateRef.current
        void (async () => {
          const content = await requestExportContent(editorValue, {
            expectedActivePath: activePath,
          })
          await exportApi.exportMarkdown(content, format, {
            rootPath,
            activePath,
          })
        })().catch((err) => window.alert(String(err)))
        return
      }
      if (id === 'view.wysiwyg') state.setViewMode('wysiwyg')
      if (id === 'view.source') state.setViewMode('source')
      if (id === 'view.graph') state.setViewMode('graph')
      if (id === 'view.toggle_sidebar') state.toggleSidebar()
      if (id === 'view.toggle_right_sidebar') state.toggleRightSidebar()
      if (id === 'theme.light') state.setTheme('light')
      if (id === 'theme.dark') state.setTheme('dark')
      if (id === 'theme.marko-light') state.setTheme('marko-light')
      if (id === 'theme.marko-dark') state.setTheme('marko-dark')
      if (id === 'help.about') {
        window.alert('marko\nA desktop Markdown workspace with graph navigation.')
      }
    }

    const domHandler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') handleMenuAction(detail)
    }

    window.addEventListener('marko:menu-action', domHandler)

    let unlisten: (() => void) | undefined
    if (isTauriRuntime()) {
      void import('@tauri-apps/api/event').then(({ listen }) => {
        void listen<string>('menu-action', (event) => {
          handleMenuAction(event.payload)
        }).then((fn) => {
          unlisten = fn
        })
      })
    }

    return () => {
      window.removeEventListener('marko:menu-action', domHandler)
      if (unlisten) unlisten()
    }
  }, [state])

  return (
    <div className="app-shell flex h-full flex-col">
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
      <div className="flex flex-1 overflow-hidden p-1.5 pt-1">
        <Sidebar
          collapsed={state.sidebarCollapsed}
          recentProjects={state.recentProjects}
          files={state.files}
          fileTree={state.fileTree}
          activePath={state.activePath}
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
        <section className="panel-surface panel-enter mx-2 flex flex-1 flex-col overflow-hidden">
          <TabsBar
            tabs={state.tabs}
            dirtyPaths={state.dirtyPaths}
            activePath={state.activePath}
            onOpenFile={state.onOpenFile}
            onCloseTab={state.onCloseTab}
            viewMode={state.viewMode}
            onChangeView={state.setViewMode}
          />
          <div className="flex-1 overflow-hidden bg-background/70">
            <Outlet context={outletContext} />
          </div>
        </section>
        <RightSidebar
          collapsed={state.rightSidebarCollapsed}
          activePath={state.activePath}
          tabs={state.tabs}
          dirtyPaths={state.dirtyPaths}
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
