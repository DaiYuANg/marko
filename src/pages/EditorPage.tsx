import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { EXPORT_CONTENT_EVENT, type ExportContentRequest } from '@/utils/exportContent'
import { useI18n } from '@/i18n/useI18n'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarkdownEditorHandle } from '@/components/MarkdownEditor'
import type { GraphData } from '@/logic/graph'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry, ViewMode } from '@/store/useAppStore'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))
const MarkdownSourceEditor = lazy(() => import('@/components/MarkdownSourceEditor'))
const GraphPage = lazy(() => import('@/pages/GraphPage'))

type EditorPageProps = {
  activePath: string | null
  editorValue: string
  onChange: (value: string) => void
  graph: GraphData
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  onOpenFile: (path: string) => void
  viewMode: ViewMode
}

export default function EditorPage({
  activePath,
  editorValue,
  onChange,
  graph,
  files,
  fileContents,
  workspaceIndex,
  onOpenFile,
  viewMode,
}: EditorPageProps) {
  const { t } = useI18n()
  const editorRef = useRef<MarkdownEditorHandle | null>(null)

  const handleMarkdownChange = useCallback(
    (nextValue: string) => {
      onChange(nextValue)
    },
    [onChange],
  )

  const editorValueRef = useRef(editorValue)
  const viewModeRef = useRef(viewMode)
  const activePathRef = useRef(activePath)

  useEffect(() => {
    editorValueRef.current = editorValue
    viewModeRef.current = viewMode
    activePathRef.current = activePath
  }, [activePath, editorValue, viewMode])

  useEffect(() => {
    const handler = (e: Event) => {
      const { expectedActivePath, respond } = (e as CustomEvent<ExportContentRequest>).detail ?? {}
      if (typeof respond !== 'function') return
      // Only respond if we're showing the requested file (avoid wrong-tab export)
      if (expectedActivePath != null && activePathRef.current !== expectedActivePath) return
      const content =
        viewModeRef.current === 'wysiwyg'
          ? (editorRef.current?.getMarkdown() ?? editorValueRef.current)
          : editorValueRef.current
      respond(content)
    }
    window.addEventListener(EXPORT_CONTENT_EVENT, handler)
    return () => window.removeEventListener(EXPORT_CONTENT_EVENT, handler)
  }, [])

  const handleSourceChange = useCallback(
    (nextValue: string) => {
      onChange(nextValue)
    },
    [onChange],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden p-3">
        <div
          className={`relative h-full overflow-hidden ${
            viewMode === 'graph' ? '' : 'editor-paper mx-auto max-w-[1040px] rounded-md'
          }`}
        >
          <div
            className={
              viewMode === 'wysiwyg' ? 'h-full animate-[view-fade_140ms_ease-out]' : 'hidden h-full'
            }
          >
            <Suspense fallback={<EditorPaneFallback />}>
              <MarkdownEditor
                ref={editorRef}
                activePath={activePath}
                value={editorValue}
                onChange={handleMarkdownChange}
              />
            </Suspense>
          </div>
          {viewMode === 'source' && (
            <div className="h-full animate-[view-fade_140ms_ease-out]">
              <Suspense fallback={<EditorPaneFallback />}>
                <MarkdownSourceEditor
                  activePath={activePath}
                  value={editorValue}
                  files={files}
                  fileContents={{
                    ...fileContents,
                    ...(activePath ? { [activePath]: editorValue } : {}),
                  }}
                  workspaceIndex={workspaceIndex}
                  onChange={handleSourceChange}
                />
              </Suspense>
            </div>
          )}
          {viewMode === 'graph' && (
            <div className="h-full animate-[view-fade_160ms_ease-out]">
              <Suspense fallback={<EditorPaneFallback />}>
                <GraphPage graph={graph} onOpenFile={onOpenFile} />
              </Suspense>
            </div>
          )}
        </div>
      </div>
      {!activePath && (
        <div className="border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {t('editor.empty')}
        </div>
      )}
    </div>
  )
}

const EditorPaneFallback = () => (
  <div className="flex h-full flex-col gap-3 p-6">
    <Skeleton className="h-5 w-40" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/2" />
  </div>
)
