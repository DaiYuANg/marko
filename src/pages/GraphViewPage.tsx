import { lazy, memo, Suspense, useMemo } from 'react'
import { withGraphLayoutPositions, type GraphData } from '@/logic/graph'
import type { GraphLayoutPositions } from '@/store/useAppStore'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'

const GraphPage = lazy(() => import('@/pages/GraphPage'))

type GraphViewPageProps = {
  graph: GraphData
  graphLayoutPositions: GraphLayoutPositions
  onOpenFile: (path: string) => void
  onSaveNodePosition: (
    layoutKey: string,
    nodeId: string,
    position: { x: number; y: number },
  ) => void
  showEmptyMessage: boolean
}

function GraphViewPage({
  graph,
  graphLayoutPositions,
  onOpenFile,
  onSaveNodePosition,
  showEmptyMessage,
}: GraphViewPageProps) {
  const { t } = useI18n()
  const graphWithSavedLayout = useMemo(
    () => withGraphLayoutPositions(graph, graphLayoutPositions),
    [graph, graphLayoutPositions],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <div className="relative h-full overflow-hidden">
          <div className="h-full animate-[view-fade_160ms_ease-out]">
            <Suspense fallback={<EditorPaneFallback />}>
              <GraphPage
                graph={graphWithSavedLayout}
                onOpenFile={onOpenFile}
                onSaveNodePosition={onSaveNodePosition}
              />
            </Suspense>
          </div>
        </div>
      </div>
      {showEmptyMessage && (
        <div className="border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {t('editor.empty')}
        </div>
      )}
    </div>
  )
}

export default memo(GraphViewPage)
