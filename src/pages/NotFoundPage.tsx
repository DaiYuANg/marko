import { useState } from 'react'
import { FileX2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type NotFoundPageProps = {
  title?: string
  description?: string
  files?: { relative_path: string }[]
  onOpenFile?: (path: string) => void
}

export default function NotFoundPage({
  title = '未找到文件',
  description = '该路径没有对应的 Markdown 文件，请返回图谱或打开其他文件。',
  files = [],
  onOpenFile,
}: NotFoundPageProps) {
  const [selected, setSelected] = useState('')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="rounded-full bg-muted p-3">
        <FileX2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-base font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">{description}</div>
      <div className="mt-2 flex w-full max-w-md items-center gap-2">
        <select
          className="h-9 flex-1 rounded-full border border-border bg-white px-3 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">选择文件…</option>
          {files.map((file) => (
            <option key={file.relative_path} value={file.relative_path}>
              {file.relative_path}
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
          打开
        </Button>
      </div>
    </div>
  )
}
