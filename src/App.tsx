import { HashRouter, Navigate, Route, Routes, useOutletContext, useParams } from 'react-router-dom'
import AppLayout, { type LayoutContext } from '@/app/AppLayout'
import EditorPage from '@/pages/EditorPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { pathToRoute, routeToPath } from '@/logic/routing'

function EditorRoute() {
  const params = useParams()
  const routeSegment = params['*']
  const {
    activePath,
    editorValue,
    onEditorChange,
    files,
    onOpenFile,
    graph,
    currentView,
    onChangeView,
  } = useOutletContext<LayoutContext>()
  const requestedPath = routeToPath(routeSegment)
  const requestedPathExists =
    requestedPath !== null &&
    files.some((file) => file.kind === 'file' && file.path === requestedPath)
  const hasRouteRequest = Boolean(routeSegment)

  if (!hasRouteRequest && activePath) {
    return <Navigate to={pathToRoute(activePath)} replace />
  }

  if (hasRouteRequest && !requestedPathExists) {
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
      onOpenFile={onOpenFile}
      viewMode={currentView}
      onChangeView={onChangeView}
    />
  )
}

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/*" element={<EditorRoute />} />
      </Route>
    </Routes>
  </HashRouter>
)
export default App
