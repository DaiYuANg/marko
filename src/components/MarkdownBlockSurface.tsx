import { memo, useMemo } from 'react'
import type { GraphContentMode } from '@/store/useAppStore'

type MarkdownBlockSurfaceProps = {
  level: number
  title: string
  content?: string
  editable?: boolean
  contentMode: GraphContentMode
  onCommitTitle?: (title: string) => void
  onCommitContent?: (content: string) => void
}

function MarkdownBlockSurface({
  level,
  title,
  content,
  editable = false,
  contentMode,
  onCommitTitle,
  onCommitContent,
}: MarkdownBlockSurfaceProps) {
  const displayContent = useMemo(() => {
    const raw = content?.trim() ?? ''
    if (!raw || contentMode === 'none') return ''
    if (contentMode === 'full') return raw
    return raw.length > 140 ? `${raw.slice(0, 140).trimEnd()}...` : raw
  }, [content, contentMode])

  return (
    <div className="space-y-1.5">
      <MarkdownHeadingBlock
        level={level}
        value={title}
        editable={editable}
        onCommit={onCommitTitle}
      />
      {displayContent ? (
        <MarkdownContentBlock
          value={displayContent}
          editable={editable && contentMode === 'full'}
          onCommit={onCommitContent}
        />
      ) : null}
    </div>
  )
}

export default memo(MarkdownBlockSurface)

function MarkdownHeadingBlock({
  level,
  value,
  editable,
  onCommit,
}: {
  level: number
  value: string
  editable: boolean
  onCommit?: (value: string) => void
}) {
  const weightClass = level <= 2 ? 'text-sm font-semibold' : 'text-[13px] font-medium'

  return (
    <div
      key={value}
      className={`nodrag rounded-sm border border-transparent px-1 leading-5 outline-none focus:border-ring focus:bg-background ${weightClass}`}
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(event) => {
        const next = event.currentTarget.textContent?.trim() ?? ''
        if (!next || next === value) return
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
      {value}
    </div>
  )
}

function MarkdownContentBlock({
  value,
  editable,
  onCommit,
}: {
  value: string
  editable: boolean
  onCommit?: (value: string) => void
}) {
  return (
    <div
      key={value}
      className="nodrag max-h-28 overflow-hidden whitespace-pre-wrap rounded-sm bg-muted/55 px-2 py-1.5 text-xs leading-5 text-muted-foreground outline-none focus:bg-background focus:ring-1 focus:ring-ring"
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? ''
        if (next === value) return
        onCommit?.(next)
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {value}
    </div>
  )
}
