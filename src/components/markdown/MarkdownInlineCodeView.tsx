import { memo } from 'react'

type MarkdownInlineCodeViewProps = {
  contentRef?: (element: HTMLElement | null) => void
}

const MarkdownInlineCodeView = ({ contentRef }: MarkdownInlineCodeViewProps) => {
  return (
    <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.88em] text-destructive">
      <span ref={contentRef} />
    </span>
  )
}

export default memo(MarkdownInlineCodeView)
