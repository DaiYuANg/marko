import { useCallback, useEffect, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Dual } from '@/playground'
import { crepeAPI, markdown } from '@/playground/atom'
import { useI18n } from '@/i18n/useI18n'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { Button } from '@/components/ui/button'
import { Code2, GitGraph, PenLine } from 'lucide-react'
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
  onChangeView: (mode: ViewMode) => void
}

export default function EditorPage({
  activePath,
  editorValue,
  onChange,
  graph,
  onOpenFile,
  viewMode,
  onChangeView,
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
      <div className="flex items-center justify-end border-b border-border bg-background px-3 py-1.5">
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
          <Button
            variant={viewMode === 'wysiwyg' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-full"
            aria-label={t('editor.modeWysiwyg')}
            onClick={() => onChangeView('wysiwyg')}
          >
            <PenLine className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'source' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-full"
            aria-label={t('editor.modeSource')}
            onClick={() => onChangeView('source')}
          >
            <Code2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-full"
            aria-label={t('tabs.workspaceGraph')}
            onClick={() => onChangeView('graph')}
          >
            <GitGraph className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20 p-2">
        <div className="relative h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className={viewMode === 'wysiwyg' ? 'h-full' : 'hidden h-full'}>
            <Dual onMarkdownChange={handleMarkdownChange} />
          </div>
          {viewMode === 'source' && (
            <div className="h-full">
              <MarkdownSourceEditor value={editorValue} onChange={handleSourceChange} />
            </div>
          )}
          {viewMode === 'graph' && <GraphPage graph={graph} onOpenFile={onOpenFile} />}
        </div>
      </div>
      {!activePath && <div className="p-3 text-sm text-muted-foreground">{t('editor.empty')}</div>}
    </div>
  )
}
