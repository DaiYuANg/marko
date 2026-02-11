import { useAtomCallback } from 'jotai/utils'
import { Suspense, useCallback } from 'react'
import { focus, markdown } from '@/playground/atom'
import CrepeEditor from '@/playground/Crepe'
import { useI18n } from '@/i18n/useI18n'

type DualProps = {
  onMarkdownChange: (value: string) => void
}

export function Dual({ onMarkdownChange }: DualProps) {
  const { t } = useI18n()
  const onMilkdownChange = useAtomCallback(
    useCallback(
      (get, set, value: string) => {
        const lock = get(focus) === 'cm'
        if (lock) return
        set(markdown, value)
        onMarkdownChange(value)
      },
      [onMarkdownChange],
    ),
  )

  return (
    <div className="relative flex h-full flex-1">
      <div className="relative h-full w-full">
        <Suspense fallback={<div className="p-4 text-sm">{t('editor.loading')}</div>}>
          <CrepeEditor onChange={onMilkdownChange} />
        </Suspense>
      </div>
    </div>
  )
}
