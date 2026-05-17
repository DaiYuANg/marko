import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { memo } from 'react'
import type { GraphNodeData } from '@/logic/graph'
import MarkdownBlockSurface from '@/components/MarkdownBlockSurface'

export function ExternalNode({
  data,
}: NodeProps<{ label: string; subtitle?: string; url: string }>) {
  return (
    <div className="rounded-md border border-amber-500/35 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
}

export function MissingNode({ data }: NodeProps<{ label: string; subtitle?: string }>) {
  return (
    <div className="rounded-md border border-destructive/35 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
}

export const HeadingNode = memo(function HeadingNode({ id, data }: NodeProps<GraphNodeData>) {
  return (
    <div className="w-[240px] rounded-md border border-primary/30 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <MarkdownBlockSurface
        level={data.level ?? 2}
        title={data.label}
        content={data.content}
        contentMode={data.contentMode ?? 'none'}
        editable={data.editable}
        onCommitTitle={(title) => data.onUpdateTitle?.(id, title)}
        onCommitContent={(content) => data.onUpdateContent?.(id, content)}
      />
      <div className="mt-1 px-1 text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
})
