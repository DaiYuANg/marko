import { useState } from 'react'
import { FileX2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type NotFoundPageProps = {
  title?: string
  description?: string
  files?: { path: string }[]
  onOpenFile?: (path: string) => void
}

export default function NotFoundPage({
  title,
  description,
  files = [],
  onOpenFile,
}: NotFoundPageProps) {
  const [selected, setSelected] = useState('')
  const { t } = useI18n()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="rounded-full bg-muted p-3">
        <FileX2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-base font-semibold">{title ?? t('notFound.title')}</div>
      <div className="text-sm text-muted-foreground">
        {description ?? t('notFound.description')}
      </div>
      <div className="mt-2 flex w-full max-w-md items-center gap-2">
        <select
          className="h-9 flex-1 rounded-full border border-border bg-white px-3 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t('notFound.selectPlaceholder')}</option>
          {files.map((file) => (
            <option key={file.path} value={file.path}>
              {file.path}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (selected && onOpenFile) {
              onOpenFile(selected)
            }
          }}
        >
          {t('notFound.open')}
        </Button>
      </div>
    </div>
  )
}
