import { memo } from 'react'
import { useEditableCommit } from '@/components/markdown/useEditableCommit'

type MarkdownCodeBlockViewProps = {
  text: string
  language?: string
  editable?: boolean
  onCommit?: (text: string) => void
}

const MarkdownCodeBlockView = ({
  text,
  language,
  editable = false,
  onCommit,
}: MarkdownCodeBlockViewProps) => {
  const editableHandlers = useEditableCommit<HTMLElement>({
    value: text,
    onCommit,
  })

  return (
    <div className="nodrag overflow-hidden rounded-sm border border-border bg-muted/55 text-xs">
      {language ? (
        <div className="border-b border-border px-2 py-1 font-medium text-muted-foreground">
          {language}
        </div>
      ) : null}
      <pre className="max-h-32 overflow-auto px-2 py-1.5 font-mono leading-5">
        <code
          key={text}
          className="block min-h-5 whitespace-pre-wrap rounded-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring"
          contentEditable={editable}
          suppressContentEditableWarning
          {...editableHandlers}
        >
          {text}
        </code>
      </pre>
    </div>
  )
}

export default memo(MarkdownCodeBlockView)
