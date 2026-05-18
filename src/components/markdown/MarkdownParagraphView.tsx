import { memo } from 'react'

type MarkdownParagraphViewProps = {
  text?: string
  editable?: boolean
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  compact?: boolean
  onCommit?: (text: string) => void
}

const MarkdownParagraphView = ({
  text = '',
  editable = false,
  contentRef,
  selected = false,
  compact = false,
  onCommit,
}: MarkdownParagraphViewProps) => {
  const selectedClass = selected ? 'ring-1 ring-ring bg-accent/50' : ''
  const sizeClass = compact
    ? 'max-h-28 overflow-hidden px-2 py-1.5 text-xs text-muted-foreground'
    : 'px-1 py-0.5 text-sm'

  if (contentRef) {
    return (
      <div
        className={`marko-md-block rounded-sm leading-6 ${selectedClass} ${sizeClass}`}
        data-selected={selected ? 'true' : 'false'}
      >
        <div ref={contentRef} />
      </div>
    )
  }

  return (
    <div
      key={text}
      className={`nodrag whitespace-pre-wrap rounded-sm bg-muted/55 leading-5 outline-none focus:bg-background focus:ring-1 focus:ring-ring ${sizeClass}`}
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? ''
        if (next === text) return
        onCommit?.(next)
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {text}
    </div>
  )
}

export default memo(MarkdownParagraphView)
