import { useCallback, useEffect, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Dual } from '@/playground'
import { crepeAPI, markdown } from '@/playground/atom'
import { useI18n } from '@/i18n/useI18n'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import GraphPage from '@/pages/GraphPage'
import type { GraphData } from '@/logic/graph'
import type { ViewMode } from '@/store/useAppStore'

type EditorPageProps = {
  activePath: string | null
  editorValue: string
  onChange: (value: string) => void
  graph: GraphData
  onOpenFile: (path: string) => void
  viewMode: ViewMode
}

export default function EditorPage({
  activePath,
  editorValue,
  onChange,
  graph,
  onOpenFile,
  viewMode,
}: EditorPageProps) {
  const [value, setValue] = useAtom(markdown)
  const crepe = useAtomValue(crepeAPI)
  const lastWysiwygValueRef = useRef<string | null>(null)
  const { t } = useI18n()

  const handleMarkdownChange = useCallback(
    (nextValue: string) => {
      lastWysiwygValueRef.current = nextValue
      onChange(nextValue)
    },
    [onChange],
  )

  useEffect(() => {
    if (!activePath) return
    if (editorValue !== value) {
      setValue(editorValue)
    }
  }, [activePath, editorValue, setValue, value])

  useEffect(() => {
    if (!activePath) return
    if (!crepe.loaded) return
    if (viewMode !== 'wysiwyg') return
    if (lastWysiwygValueRef.current === editorValue) return
    crepe.update(editorValue)
  }, [activePath, crepe, editorValue, viewMode])

  useEffect(() => {
    lastWysiwygValueRef.current = null
  }, [activePath])

  const handleSourceChange = useCallback(
    (nextValue: string) => {
      setValue(nextValue)
      onChange(nextValue)
    },
    [onChange, setValue],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/10 p-2">
        <div className="relative h-full overflow-hidden rounded-xl border border-border/70 bg-background/90 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]">
          <div
            className={
              viewMode === 'wysiwyg' ? 'h-full animate-[view-fade_140ms_ease-out]' : 'hidden h-full'
            }
          >
            <Dual onMarkdownChange={handleMarkdownChange} />
          </div>
          {viewMode === 'source' && (
            <div className="h-full animate-[view-fade_140ms_ease-out]">
              <MarkdownSourceEditor value={editorValue} onChange={handleSourceChange} />
            </div>
          )}
          {viewMode === 'graph' && (
            <div className="h-full animate-[view-fade_160ms_ease-out]">
              <GraphPage graph={graph} onOpenFile={onOpenFile} />
            </div>
          )}
        </div>
      </div>
      {!activePath && <div className="p-3 text-sm text-muted-foreground">{t('editor.empty')}</div>}
    </div>
  )
}
