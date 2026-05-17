import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { FileText, Search } from 'lucide-react'
import { EXPORT_CONTENT_EVENT, type ExportContentRequest } from '@/utils/exportContent'
import { useI18n } from '@/i18n/useI18n'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
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
  showStatusBar: boolean
}

const getDocumentStats = (value: string) => {
  const trimmed = value.trim()
  return {
    lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length,
    characters: value.replace(/\s/g, '').length,
  }
}

function EditorPage({
  activePath,
  editorValue,
  onChange,
  graph,
  files,
  fileContents,
  workspaceIndex,
  onOpenFile,
  viewMode,
  showStatusBar,
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

  const availableFiles = useMemo(() => files.filter((file) => file.kind === 'file'), [files])
  const showEmptyState = !activePath && viewMode !== 'graph'
  const deferredStatsValue = useDeferredValue(editorValue)
  const stats = useMemo(() => getDocumentStats(deferredStatsValue), [deferredStatsValue])
  const sourceFileContents = useMemo(
    () =>
      viewMode === 'source' && activePath
        ? {
            ...fileContents,
            [activePath]: editorValue,
          }
        : fileContents,
    [activePath, editorValue, fileContents, viewMode],
  )
  const viewLabel =
    viewMode === 'graph'
      ? t('tabs.workspaceGraph')
      : viewMode === 'source'
        ? t('editor.modeSource')
        : t('editor.modeWysiwyg')

  if (showEmptyState) {
    return <EditorEmptyState files={availableFiles} onOpenFile={onOpenFile} />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <div
          className={`relative h-full overflow-hidden ${
            viewMode === 'graph' ? '' : 'editor-paper mx-auto max-w-[1060px] rounded-md'
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
                  fileContents={sourceFileContents}
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
      {!activePath && viewMode === 'graph' && (
        <div className="border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {t('editor.empty')}
        </div>
      )}
      {showStatusBar && activePath && viewMode !== 'graph' && (
        <div className="tab-strip flex h-7 items-center justify-between gap-3 border-t border-border/80 px-3 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">{activePath}</div>
          <div className="flex shrink-0 items-center gap-3">
            <span>{viewLabel}</span>
            <span>
              {stats.lines} {t('status.lines')}
            </span>
            <span>
              {stats.words} {t('status.words')}
            </span>
            <span>
              {stats.characters} {t('status.characters')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(EditorPage)

const EditorEmptyState = ({
  files,
  onOpenFile,
}: {
  files: FileEntry[]
  onOpenFile: (path: string) => void
}) => {
  const { t } = useI18n()
  const visibleFiles = files.slice(0, 6)

  return (
    <div className="editor-stage flex h-full items-center justify-center p-6">
      <div className="editor-paper w-full max-w-xl rounded-md p-6 text-left">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-md border border-border bg-muted p-2 shadow-sm">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">{t('editor.emptyTitle')}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('editor.emptyDescription')}
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mb-4 h-8 rounded-md"
          onClick={() => window.dispatchEvent(new CustomEvent('marko:focus-file-search'))}
        >
          <Search className="h-4 w-4" />
          {t('editor.emptySearch')}
        </Button>
        {visibleFiles.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase text-muted-foreground">
              {t('editor.emptyRecent')}
            </div>
            <div className="grid gap-1">
              {visibleFiles.map((file) => (
                <Button
                  key={file.path}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start rounded-md px-2 text-xs"
                  onClick={() => onOpenFile(file.path)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{file.path}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
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
