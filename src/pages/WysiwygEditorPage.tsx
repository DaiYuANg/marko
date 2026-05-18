import { lazy, memo, Suspense, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import type { MarkdownEditorHandle } from '@/components/MarkdownEditor'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'
import { EXPORT_CONTENT_EVENT, type ExportContentRequest } from '@/utils/exportContent'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))

type WysiwygEditorPageProps = {
  activePath: string | null
  value: string
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

function WysiwygEditorPage({ activePath, value, onChange, showStatusBar }: WysiwygEditorPageProps) {
  const { t } = useI18n()
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const activePathRef = useRef(activePath)
  const valueRef = useRef(value)
  const deferredValue = useDeferredValue(value)
  const stats = useMemo(() => getDocumentStats(deferredValue), [deferredValue])
  const slashLabels = useMemo<SlashCommandLabels>(
    () => ({
      textGroup: t('slash.textGroup'),
      listGroup: t('slash.listGroup'),
      advancedGroup: t('slash.advancedGroup'),
      text: t('slash.text'),
      heading1: t('slash.heading1'),
      heading2: t('slash.heading2'),
      heading3: t('slash.heading3'),
      heading4: t('slash.heading4'),
      heading5: t('slash.heading5'),
      heading6: t('slash.heading6'),
      quote: t('slash.quote'),
      divider: t('slash.divider'),
      bulletList: t('slash.bulletList'),
      orderedList: t('slash.orderedList'),
      taskList: t('slash.taskList'),
      codeBlock: t('slash.codeBlock'),
      table: t('slash.table'),
    }),
    [t],
  )

  useEffect(() => {
    activePathRef.current = activePath
    valueRef.current = value
  }, [activePath, value])

  useEffect(() => {
    const handler = (event: Event) => {
      const { expectedActivePath, respond } =
        (event as CustomEvent<ExportContentRequest>).detail ?? {}
      if (typeof respond !== 'function') return
      if (expectedActivePath != null && activePathRef.current !== expectedActivePath) return
      respond(editorRef.current?.getMarkdown() ?? valueRef.current)
    }
    window.addEventListener(EXPORT_CONTENT_EVENT, handler)
    return () => window.removeEventListener(EXPORT_CONTENT_EVENT, handler)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <div className="editor-paper relative mx-auto h-full max-w-[1060px] overflow-hidden rounded-md">
          <div className="h-full animate-[view-fade_140ms_ease-out]">
            <Suspense fallback={<EditorPaneFallback />}>
              <MarkdownEditor
                ref={editorRef}
                activePath={activePath}
                value={value}
                onChange={onChange}
                placeholder={t('editor.placeholder')}
                slashLabels={slashLabels}
              />
            </Suspense>
          </div>
        </div>
      </div>
      {showStatusBar && activePath && (
        <div className="tab-strip flex h-7 items-center justify-between gap-3 border-t border-border/80 px-3 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">{activePath}</div>
          <div className="flex shrink-0 items-center gap-3">
            <span>{t('editor.modeWysiwyg')}</span>
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

export default memo(WysiwygEditorPage)
