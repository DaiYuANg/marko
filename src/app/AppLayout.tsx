import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import Titlebar from '@/components/Titlebar'
import TabsBar from '@/components/TabsBar'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import type { GraphData } from '@/logic/graph'
import type {
  FileEntry,
  GraphLayoutPositions,
  ThemeMode,
  ViewMode,
  WorkspaceTab,
} from '@/store/useAppStore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportApi } from '@/services/exportApi'
import { fsApi, type FsWorkspaceIndex } from '@/services/fsApi'
import { requestExportContent } from '@/utils/exportContent'
import { isTauriRuntime } from '@/utils/tauri'
import type { SaveState } from '@/app/useEditorBuffer'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
} from '@/utils/editorNavigation'
import { useLatest } from 'ahooks'
import { useTauriReadySignal } from '@/app/useTauriReadySignal'
import type { GitDiffRequest } from '@/services/gitApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { FsSearchResult } from '@/services/fsApi'

export type LayoutContext = {
  activePath: string | null
  editorValue: string
  graph: GraphData
  onEditorChange: (value: string) => void
  onOpenFile: (path: string) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  saveStates: Record<string, SaveState>
  currentView: ViewMode
  activeTab: WorkspaceTab | null
  rootPath: string
  showEditorStatusBar: boolean
  graphLayoutPositions: GraphLayoutPositions
  onSaveGraphNodePosition: (
    layoutKey: string,
    nodeId: string,
    position: { x: number; y: number },
  ) => void
  onCloseActiveTab: () => void
}

export default function AppLayout() {
  const state = useAppLayoutState()
  const stateRef = useLatest(state)
  const stateOpenFile = state.onOpenFile
  const stateOpenGitDiff = state.onOpenGitDiff
  const changeView = state.setViewMode
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)
  useTauriReadySignal()

  const handleOpenFile = useCallback(
    (path: string) => {
      stateOpenFile(path)
    },
    [stateOpenFile],
  )

  const handleOpenGitDiff = useCallback(
    (request: GitDiffRequest) => {
      stateOpenGitDiff(request.path, request.section)
    },
    [stateOpenGitDiff],
  )

  const handleOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      stateOpenFile(result.path)
      changeView('source')
      window.setTimeout(() => {
        requestFocusSourcePosition({
          path: result.path,
          line: result.line,
          column: result.column,
        })
      }, 80)
    },
    [changeView, stateOpenFile],
  )

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
      onOpenFile: handleOpenFile,
      theme: state.theme,
      setTheme: state.setTheme,
      files: state.files,
      fileContents: state.fileContents,
      workspaceIndex: state.workspaceIndex,
      saveStates: state.saveStates,
      currentView: state.viewMode,
      activeTab: state.activeTab,
      rootPath: state.rootPath,
      showEditorStatusBar: state.showEditorStatusBar,
      graphLayoutPositions: state.graphLayoutPositions,
      onSaveGraphNodePosition: state.setGraphNodePosition,
      onCloseActiveTab: state.onCloseActiveTab,
    } as LayoutContext
  }, [
    state.activePath,
    state.editorValue,
    state.graph,
    state.onEditorChange,
    handleOpenFile,
    state.theme,
    state.setTheme,
    state.files,
    state.fileContents,
    state.workspaceIndex,
    state.saveStates,
    state.viewMode,
    state.activeTab,
    state.rootPath,
    state.showEditorStatusBar,
    state.graphLayoutPositions,
    state.setGraphNodePosition,
    state.onCloseActiveTab,
  ])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  const openHeading = useCallback(
    (path: string, slug: string) => {
      handleOpenFile(path)
      changeView('wysiwyg')
      setPendingHeading({ path, slug })
    },
    [changeView, handleOpenFile],
  )

  useEffect(() => {
    if (!pendingHeading) return
    if (state.activePath !== pendingHeading.path || state.viewMode !== 'wysiwyg') return

    const timer = window.setTimeout(() => {
      requestFocusHeading(pendingHeading)
      setPendingHeading((current) =>
        current?.path === pendingHeading.path && current.slug === pendingHeading.slug
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [pendingHeading, state.activePath, state.viewMode])

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

  const handleMenuAction = useCallback(
    (id: string) => {
      const currentState = stateRef.current

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
          currentState.files
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

      if (id.startsWith('edit.')) {
        executeEdit(id)
        return
      }
      if (id === 'file.open_project') {
        void currentState.onSelectProject()
        return
      }
      if (id === 'file.open_file') {
        void currentState.onSelectSingleFile()
        return
      }
      if (id === 'file.new') {
        const next = createUntitledPath()
        void currentState.createFile(next).then(() => currentState.onOpenFile(next))
        return
      }
      if (id === 'file.export_pdf' || id === 'file.export_docx' || id === 'file.export_html') {
        if (!isTauriRuntime()) return
        const format =
          id === 'file.export_pdf' ? 'pdf' : id === 'file.export_docx' ? 'docx' : 'html'
        const { activePath, rootPath, editorValue } = currentState
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
      if (id === 'view.wysiwyg') currentState.setViewMode('wysiwyg')
      if (id === 'view.source') currentState.setViewMode('source')
      if (id === 'view.graph') currentState.setViewMode('graph')
      if (id === 'view.toggle_sidebar') currentState.toggleSidebar()
      if (id === 'view.toggle_right_sidebar') currentState.toggleRightSidebar()
      if (id === 'theme.light') currentState.setTheme('light')
      if (id === 'theme.dark') currentState.setTheme('dark')
      if (id === 'theme.marko-light') currentState.setTheme('marko-light')
      if (id === 'theme.marko-dark') currentState.setTheme('marko-dark')
      if (id === 'help.about') {
        window.alert('marko\nA desktop Markdown workspace with graph navigation.')
      }
    },
    [stateRef],
  )

  useEffect(() => {
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
  }, [handleMenuAction])

  return (
    <div className="app-shell flex h-full flex-col">
      <Titlebar
        onToggleSidebar={state.toggleSidebar}
        onToggleRightSidebar={state.toggleRightSidebar}
        onSelectProject={state.onSelectProject}
        onSelectSingleFile={state.onSelectSingleFile}
        onOpenFile={handleOpenFile}
        onOpenHeading={openHeading}
        onOpenSearchResult={handleOpenSearchResult}
        onChangeView={state.setViewMode}
        files={state.files}
        workspaceIndex={state.workspaceIndex}
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
          activePath={state.activeResourcePath}
          onOpenFile={handleOpenFile}
          onOpenProject={state.onOpenProject}
          onCreateFile={state.createFile}
          onCreateFolder={state.createFolder}
          onRenamePath={state.renamePath}
          onDeletePath={state.deletePath}
          onUseInternalRoot={state.onUseInternalRoot}
          rootKind={state.rootKind}
          rootPath={state.rootPath}
          onOpenGitDiff={handleOpenGitDiff}
          onInspectPath={state.onInspectPath}
          onOpenSearchResult={handleOpenSearchResult}
        />
        <section className="workspace-main flex min-w-0 flex-1 flex-col overflow-hidden border-x border-border/80">
          <TabsBar
            tabs={state.tabs}
            dirtyPaths={state.dirtyPaths}
            saveStates={state.saveStates}
            activeTabId={state.activeTabId}
            onOpenTab={state.onOpenTab}
            onCloseTab={state.onCloseTab}
            viewMode={state.viewMode}
            onChangeView={state.setViewMode}
            silentSave={state.silentSave}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet context={outletContext} />
          </div>
        </section>
        <RightSidebar
          collapsed={state.rightSidebarCollapsed}
          activePath={state.activePath}
          editorValue={state.editorValue}
          files={state.files}
          fileContents={state.fileContents}
          workspaceIndex={state.workspaceIndex}
          tabs={state.tabs.map(getWorkspaceTabId)}
          totalFiles={totalFiles}
          onOpenFile={handleOpenFile}
          viewMode={state.viewMode}
          onChangeView={state.setViewMode}
          inspectedPath={state.inspectedPath}
        />
      </div>
    </div>
  )
}
