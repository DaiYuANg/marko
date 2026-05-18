import { memo } from 'react'

type MarkdownDividerViewProps = {
  selected?: boolean
}

function MarkdownDividerView({ selected = false }: MarkdownDividerViewProps) {
  return (
    <div className={`my-5 rounded-sm px-1 py-2 ${selected ? 'bg-accent/45 ring-1 ring-ring' : ''}`}>
      <div className="h-px bg-border" />
    </div>
  )
}

export default memo(MarkdownDividerView)
