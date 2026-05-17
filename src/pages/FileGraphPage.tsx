import { useParams } from 'react-router-dom'
import GraphViewPage from '@/pages/GraphViewPage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useLayoutContext } from '@/pages/useLayoutContext'

export default function FileGraphPage() {
  const params = useParams()
  const context = useLayoutContext()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  return (
    <GraphViewPage
      graph={context.graph}
      markdown={context.editorValue}
      onOpenFile={context.onOpenFile}
      onChange={context.onEditorChange}
      showMiniMap={context.graphMiniMapEnabled}
      contentMode={context.graphContentMode}
      editable
      showEmptyMessage={false}
    />
  )
}
