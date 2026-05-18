import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { memo, useCallback } from 'react'
import type { GraphNodeData } from '@/logic/graph'
import {
  createHeadingSectionBlocks,
  serializeMarkdownBlocks,
  updateMarkdownBlockText,
  type MarkdownBlockCommit,
} from '@/logic/markdownBlocks'
import MarkdownBlockSurface from '@/components/MarkdownBlockSurface'

export const ExternalNode = ({
  data,
}: NodeProps<{ label: string; subtitle?: string; url: string }>) => {
  return (
    <div className="rounded-md border border-amber-500/35 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
}

export const MissingNode = ({ data }: NodeProps<{ label: string; subtitle?: string }>) => {
  return (
    <div className="rounded-md border border-destructive/35 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
}

export const HeadingNode = memo(({ id, data }: NodeProps<GraphNodeData>) => {
  const blocks = createHeadingSectionBlocks({
    headingId: id,
    level: data.level ?? 2,
    title: data.label,
    content: data.content,
    contentBlocks: data.contentBlocks,
    contentMode: data.contentMode ?? 'none',
    editable: Boolean(data.editable),
  })

  const commitBlock = useCallback(
    (commit: MarkdownBlockCommit) => {
      if (commit.id.endsWith(':heading')) {
        data.onUpdateTitle?.(id, commit.text)
        return
      }
      if (commit.id.endsWith(':content')) {
        data.onUpdateContent?.(id, commit.text)
        return
      }

      const contentBlocks = blocks.filter((block) => block.kind !== 'heading')
      const nextBlocks = updateMarkdownBlockText(contentBlocks, commit)
      if (!nextBlocks) return
      data.onUpdateContent?.(id, serializeMarkdownBlocks(nextBlocks))
    },
    [blocks, data, id],
  )

  return (
    <div className="w-[260px] rounded-md border border-primary/30 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <MarkdownBlockSurface blocks={blocks} onCommitBlock={commitBlock} />
      <div className="mt-1 px-1 text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
})
