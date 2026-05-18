import { memo } from 'react'

type MarkdownLinkViewProps = {
  contentRef?: (element: HTMLElement | null) => void
}

function MarkdownLinkView({ contentRef }: MarkdownLinkViewProps) {
  return (
    <span className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80">
      <span ref={contentRef} />
    </span>
  )
}

export default memo(MarkdownLinkView)
