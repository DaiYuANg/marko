import { memo } from 'react'

type MarkdownTextMarkVariant = 'strong' | 'emphasis' | 'strikethrough'

type MarkdownTextMarkViewProps = {
  variant: MarkdownTextMarkVariant
  contentRef?: (element: HTMLElement | null) => void
}

const MarkdownTextMarkView = ({ variant, contentRef }: MarkdownTextMarkViewProps) => {
  if (variant === 'strong') {
    return (
      <span className="font-semibold text-foreground">
        <span ref={contentRef} />
      </span>
    )
  }
  if (variant === 'emphasis') {
    return (
      <span className="italic text-foreground">
        <span ref={contentRef} />
      </span>
    )
  }
  return (
    <span className="text-muted-foreground line-through decoration-border decoration-2">
      <span ref={contentRef} />
    </span>
  )
}

export default memo(MarkdownTextMarkView)
