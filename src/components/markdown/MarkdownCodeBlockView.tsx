import { memo } from 'react'

type MarkdownCodeBlockViewProps = {
  text: string
  language?: string
}

function MarkdownCodeBlockView({ text, language }: MarkdownCodeBlockViewProps) {
  return (
    <div className="nodrag overflow-hidden rounded-sm border border-border bg-muted/55 text-xs">
      {language ? (
        <div className="border-b border-border px-2 py-1 font-medium text-muted-foreground">
          {language}
        </div>
      ) : null}
      <pre className="max-h-32 overflow-auto px-2 py-1.5 font-mono leading-5">
        <code>{text}</code>
      </pre>
    </div>
  )
}

export default memo(MarkdownCodeBlockView)
