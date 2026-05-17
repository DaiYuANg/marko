import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import AppLayout, { type LayoutContext } from '@/app/AppLayout'
import EditorPage from '@/pages/EditorPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { pathToRoute, routeToGitDiff, routeToPath } from '@/logic/routing'

const EditorRoute = () => {
  const params = useParams()
  const location = useLocation()
  const routeSegment = params['*']
  const {
    activePath,
    editorValue,
    onEditorChange,
    files,
    fileContents,
    workspaceIndex,
    onOpenFile,
    graph,
    currentView,
    rootPath,
    activeTab,
    onCloseActiveTab,
    showEditorStatusBar,
    graphLayoutPositions,
    onSaveGraphNodePosition,
  } = useOutletContext<LayoutContext>()
  const requestedGitDiff = routeToGitDiff(location.pathname)
  const requestedPath = routeToPath(routeSegment)
  const routeActiveTab = requestedGitDiff
    ? {
        kind: 'git-diff' as const,
        path: requestedGitDiff.path,
        section: requestedGitDiff.section,
      }
    : activeTab
  const requestedPathExists =
    requestedPath !== null &&
    files.some((file) => file.kind === 'file' && file.path === requestedPath)
  const hasRouteRequest = Boolean(routeSegment)

  if (!requestedGitDiff && !hasRouteRequest && activePath) {
    return <Navigate to={pathToRoute(activePath)} replace />
  }

  if (!requestedGitDiff && hasRouteRequest && !requestedPathExists) {
    return (
      <NotFoundPage files={files.filter((file) => file.kind === 'file')} onOpenFile={onOpenFile} />
    )
  }

  return (
    <EditorPage
      activePath={activePath}
      editorValue={editorValue}
      onChange={onEditorChange}
      graph={graph}
      files={files}
      fileContents={fileContents}
      workspaceIndex={workspaceIndex}
      onOpenFile={onOpenFile}
      viewMode={currentView}
      rootPath={rootPath}
      activeTab={routeActiveTab}
      onCloseActiveTab={onCloseActiveTab}
      showStatusBar={showEditorStatusBar}
      graphLayoutPositions={graphLayoutPositions}
      onSaveGraphNodePosition={onSaveGraphNodePosition}
    />
  )
}

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/_diff/:section/*" element={<EditorRoute />} />
        <Route path="/*" element={<EditorRoute />} />
      </Route>
    </Routes>
  </HashRouter>
)
export default App
