import GraphViewPage from '@/pages/GraphViewPage'
import { useLayoutContext } from '@/pages/useLayoutContext'

export default function WorkspaceGraphPage() {
  const context = useLayoutContext()

  return (
    <GraphViewPage
      graph={context.graph}
      markdown={context.editorValue}
      onOpenFile={context.onOpenFile}
      onChange={context.onEditorChange}
      showMiniMap={context.graphMiniMapEnabled}
      contentMode={context.graphContentMode}
      editable={false}
      showEmptyMessage={false}
    />
  )
}
