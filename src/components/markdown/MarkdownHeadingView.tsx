import { memo } from 'react'

type MarkdownHeadingViewProps = {
  level: number
  text?: string
  editable?: boolean
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  onCommit?: (text: string) => void
}

function MarkdownHeadingView({
  level,
  text = '',
  editable = false,
  contentRef,
  selected = false,
  onCommit,
}: MarkdownHeadingViewProps) {
  const weightClass = level <= 2 ? 'text-sm font-semibold' : 'text-[13px] font-medium'
  const selectedClass = selected ? 'border-ring bg-accent/50' : 'border-transparent'

  if (contentRef) {
    return (
      <div className={`rounded-sm border px-1 leading-5 ${selectedClass} ${weightClass}`}>
        <div ref={contentRef} />
      </div>
    )
  }

  return (
    <div
      key={text}
      className={`nodrag rounded-sm border border-transparent px-1 leading-5 outline-none focus:border-ring focus:bg-background ${weightClass}`}
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(event) => {
        const next = event.currentTarget.textContent?.trim() ?? ''
        if (!next || next === text) return
        onCommit?.(next)
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {text}
    </div>
  )
}

export default memo(MarkdownHeadingView)
