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

const NotFoundPage = ({ title, description, files = [], onOpenFile }: NotFoundPageProps) => {
  const [selected, setSelected] = useState('')
  const { t } = useI18n()

  return (
    <div className="editor-stage flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-md border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-muted">
          <FileX2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-base font-semibold">{title ?? t('notFound.title')}</div>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">
          {description ?? t('notFound.description')}
        </div>
        <div className="mt-4 flex w-full items-center gap-2">
          <select
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
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
            className="h-9 rounded-md"
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
    </div>
  )
}
export default NotFoundPage
