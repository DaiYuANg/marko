import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'

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

export function HeadingNode({ data }: NodeProps<{ label: string; subtitle?: string }>) {
  return (
    <div className="rounded-md border border-primary/30 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
}
