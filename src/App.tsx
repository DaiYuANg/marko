import { HashRouter, Navigate, Route, Routes, useOutletContext, useParams } from 'react-router-dom'
import AppLayout, { type LayoutContext } from '@/app/AppLayout'
import EditorEmptyState from '@/pages/EditorEmptyState'
import GitDiffPage from '@/pages/GitDiffPage'
import GraphViewPage from '@/pages/GraphViewPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SourceCodePage from '@/pages/SourceCodePage'
import WysiwygEditorPage from '@/pages/WysiwygEditorPage'
import {
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
  isGitDiffSection,
  pathToRoute,
} from '@/logic/routing'

const useLayoutContext = () => useOutletContext<LayoutContext>()

const fileExists = (files: LayoutContext['files'], path: string | null) =>
  Boolean(path && files.some((file) => file.kind === 'file' && file.path === path))

const FileNotFound = ({
  files,
  onOpenFile,
}: {
  files: LayoutContext['files']
  onOpenFile: (path: string) => void
}) => <NotFoundPage files={files.filter((file) => file.kind === 'file')} onOpenFile={onOpenFile} />

const WysiwygRoute = () => {
  const params = useParams()
  const context = useLayoutContext()
  const requestedPath = params['*'] || null
  const activePath = requestedPath ?? context.activePath

  if (!requestedPath && context.activePath) {
    return <Navigate to={pathToRoute(context.activePath)} replace />
  }

  if (requestedPath && !fileExists(context.files, requestedPath)) {
    return <FileNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (!activePath) {
    return (
      <EditorEmptyState
        files={context.files.filter((file) => file.kind === 'file')}
        onOpenFile={context.onOpenFile}
      />
    )
  }

  return (
    <WysiwygEditorPage
      activePath={activePath}
      value={context.editorValue}
      onChange={context.onEditorChange}
      showStatusBar={context.showEditorStatusBar}
    />
  )
}

const SourceRoute = () => {
  const params = useParams()
  const context = useLayoutContext()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  return (
    <SourceCodePage
      activePath={requestedPath}
      value={context.editorValue}
      files={context.files}
      fileContents={context.fileContents}
      workspaceIndex={context.workspaceIndex}
      onChange={context.onEditorChange}
      showStatusBar={context.showEditorStatusBar}
    />
  )
}

const GraphFileRoute = () => {
  const params = useParams()
  const context = useLayoutContext()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  return (
    <GraphViewPage
      graph={context.graph}
      graphLayoutPositions={context.graphLayoutPositions}
      onOpenFile={context.onOpenFile}
      onSaveNodePosition={context.onSaveGraphNodePosition}
      showEmptyMessage={false}
    />
  )
}

const GraphWorkspaceRoute = () => {
  const context = useLayoutContext()

  return (
    <GraphViewPage
      graph={context.graph}
      graphLayoutPositions={context.graphLayoutPositions}
      onOpenFile={context.onOpenFile}
      onSaveNodePosition={context.onSaveGraphNodePosition}
      showEmptyMessage={false}
    />
  )
}

const GitDiffRoute = () => {
  const params = useParams()
  const context = useLayoutContext()
  const section = params.section
  const path = params['*'] || null

  if (!isGitDiffSection(section) || !path) {
    return <FileNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  return (
    <GitDiffPage
      rootPath={context.rootPath}
      request={{ path, section }}
      onClose={context.onCloseActiveTab}
      onOpenFile={context.onOpenFile}
    />
  )
}

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={GIT_DIFF_ROUTE_PATTERN} element={<GitDiffRoute />} />
        <Route path={SOURCE_ROUTE_PATTERN} element={<SourceRoute />} />
        <Route path={GRAPH_FILE_ROUTE_PATTERN} element={<GraphFileRoute />} />
        <Route path={GRAPH_WORKSPACE_ROUTE_PATTERN} element={<GraphWorkspaceRoute />} />
        <Route path={FILE_ROUTE_PATTERN} element={<WysiwygRoute />} />
      </Route>
    </Routes>
  </HashRouter>
)

export default App
