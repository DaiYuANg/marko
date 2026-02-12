import { useCallback, useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Dual } from '@/playground'
import { crepeAPI, markdown } from '@/playground/atom'
import { useI18n } from '@/i18n/useI18n'
import { Switch } from '@/components/ui/switch'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { Code2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

type EditorPageProps = {
  activePath: string | null
  editorValue: string
  onChange: (value: string) => void
}

export default function EditorPage({ activePath, editorValue, onChange }: EditorPageProps) {
  const [value, setValue] = useAtom(markdown)
  const crepe = useAtomValue(crepeAPI)
  const [sourceMode, setSourceMode] = useState(false)
  const { t } = useI18n()
  const handleMarkdownChange = useCallback(
    (nextValue: string) => {
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
    if (crepe.loaded) {
      crepe.update(editorValue)
    }
  }, [activePath, crepe, editorValue])

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
            variant={!sourceMode ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-full"
            aria-label={t('editor.modeWysiwyg')}
            onClick={() => setSourceMode(false)}
          >
            <PenLine className="h-3.5 w-3.5" />
          </Button>
          <Switch
            checked={sourceMode}
            onCheckedChange={setSourceMode}
            aria-label={t('editor.modeToggle')}
          />
          <Button
            variant={sourceMode ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-full"
            aria-label={t('editor.modeSource')}
            onClick={() => setSourceMode(true)}
          >
            <Code2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20 p-2">
        <div className="h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          {sourceMode ? (
            <MarkdownSourceEditor value={editorValue} onChange={handleSourceChange} />
          ) : (
            <Dual onMarkdownChange={handleMarkdownChange} />
          )}
        </div>
      </div>
      {!activePath && <div className="p-3 text-sm text-muted-foreground">{t('editor.empty')}</div>}
    </div>
  )
}
