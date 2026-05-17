import { lazy, memo, Suspense, useDeferredValue, useMemo } from 'react'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'

const MarkdownSourceEditor = lazy(() => import('@/components/MarkdownSourceEditor'))

type SourceCodePageProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  onChange: (value: string) => void
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

function SourceCodePage({
  activePath,
  value,
  files,
  fileContents,
  workspaceIndex,
  onChange,
  showStatusBar,
}: SourceCodePageProps) {
  const { t } = useI18n()
  const deferredValue = useDeferredValue(value)
  const stats = useMemo(() => getDocumentStats(deferredValue), [deferredValue])
  const sourceFileContents = useMemo(
    () =>
      activePath
        ? {
            ...fileContents,
            [activePath]: value,
          }
        : fileContents,
    [activePath, fileContents, value],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <div className="editor-paper relative mx-auto h-full max-w-[1060px] overflow-hidden rounded-md">
          <div className="h-full animate-[view-fade_140ms_ease-out]">
            <Suspense fallback={<EditorPaneFallback />}>
              <MarkdownSourceEditor
                activePath={activePath}
                value={value}
                files={files}
                fileContents={sourceFileContents}
                workspaceIndex={workspaceIndex}
                onChange={onChange}
              />
            </Suspense>
          </div>
        </div>
      </div>
      {showStatusBar && activePath && (
        <div className="tab-strip flex h-7 items-center justify-between gap-3 border-t border-border/80 px-3 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">{activePath}</div>
          <div className="flex shrink-0 items-center gap-3">
            <span>{t('editor.modeSource')}</span>
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

export default memo(SourceCodePage)
