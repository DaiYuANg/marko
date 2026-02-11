import { HashRouter, Navigate, Route, Routes, useOutletContext, useParams } from 'react-router-dom'
import AppLayout, { type LayoutContext } from '@/app/AppLayout'
import EditorPage from '@/pages/EditorPage'
import GraphPage from '@/pages/GraphPage'
import NotFoundPage from '@/pages/NotFoundPage'

function EditorRoute() {
  const { slug } = useParams()
  const { activePath, editorValue, onEditorChange, getSlugForPath, slugToPath, files, onOpenFile } =
    useOutletContext<LayoutContext>()

  if (!slug && activePath) {
    return <Navigate to={`/${getSlugForPath(activePath)}`} replace />
  }

  if (slug && !slugToPath.has(slug)) {
    return (
      <NotFoundPage files={files.filter((file) => file.kind === 'file')} onOpenFile={onOpenFile} />
    )
  }

  return <EditorPage activePath={activePath} editorValue={editorValue} onChange={onEditorChange} />
}

function GraphRoute() {
  const { graph, onOpenFile } = useOutletContext<LayoutContext>()
  return <GraphPage graph={graph} onOpenFile={onOpenFile} />
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/graph" element={<GraphRoute />} />
          <Route path="/:slug" element={<EditorRoute />} />
          <Route path="*" element={<NotFoundPage />} />
          <Route path="/" element={<EditorRoute />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
