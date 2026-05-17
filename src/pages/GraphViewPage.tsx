import { lazy, memo, Suspense, useMemo } from 'react'
import type { GraphData } from '@/logic/graph'
import type { GraphContentMode } from '@/store/useAppStore'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'

const GraphPage = lazy(() => import('@/pages/GraphPage'))

type GraphViewPageProps = {
  graph: GraphData
  markdown: string
  onOpenFile: (path: string) => void
  onChange: (value: string) => void
  showMiniMap: boolean
  contentMode: GraphContentMode
  editable: boolean
  showEmptyMessage: boolean
}

function GraphViewPage({
  graph,
  markdown,
  onOpenFile,
  onChange,
  showMiniMap,
  contentMode,
  editable,
  showEmptyMessage,
}: GraphViewPageProps) {
  const { t } = useI18n()
  const canEdit = editable && graph.nodes.some((node) => node.type === 'heading')

  const updateHeadingTitle = useMemo(
    () => (nodeId: string, title: string) => {
      const node = graph.nodes.find((item) => item.id === nodeId)
      const headingLine = node?.data.line
      const level = node?.data.level
      if (!headingLine || !level) return
      onChange(replaceHeadingTitle(markdown, headingLine, level, title))
    },
    [graph.nodes, markdown, onChange],
  )

  const updateHeadingContent = useMemo(
    () => (nodeId: string, content: string) => {
      const node = graph.nodes.find((item) => item.id === nodeId)
      const startLine = node?.data.contentStartLine
      const endLine = node?.data.contentEndLine
      if (!startLine || !endLine) return
      onChange(replaceLineRange(markdown, startLine, endLine, content))
    },
    [graph.nodes, markdown, onChange],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <div className="relative h-full overflow-hidden">
          <div className="h-full animate-[view-fade_160ms_ease-out]">
            <Suspense fallback={<EditorPaneFallback />}>
              <GraphPage
                graph={graph}
                onOpenFile={onOpenFile}
                showMiniMap={showMiniMap}
                contentMode={contentMode}
                editable={canEdit}
                onUpdateHeadingTitle={updateHeadingTitle}
                onUpdateHeadingContent={updateHeadingContent}
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

function replaceHeadingTitle(markdown: string, line: number, level: number, title: string) {
  const lines = splitMarkdownLines(markdown)
  const lineIndex = line - 1
  if (!lines[lineIndex]) return markdown
  lines[lineIndex] = `${'#'.repeat(level)} ${title}`
  return joinMarkdownLines(lines, markdown)
}

function replaceLineRange(markdown: string, startLine: number, endLine: number, content: string) {
  const lines = splitMarkdownLines(markdown)
  const startIndex = Math.max(0, startLine - 1)
  const endIndex = Math.max(startIndex, endLine - 1)
  const nextLines = content.length === 0 ? [] : content.split(/\r\n|\r|\n/)
  lines.splice(startIndex, endIndex - startIndex, ...nextLines)
  return joinMarkdownLines(lines, markdown)
}

function splitMarkdownLines(markdown: string) {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function joinMarkdownLines(lines: string[], original: string) {
  const joined = lines.join('\n')
  return original.endsWith('\n') && !joined.endsWith('\n') ? `${joined}\n` : joined
}
