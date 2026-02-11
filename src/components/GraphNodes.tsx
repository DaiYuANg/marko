import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'

export function ExternalNode({
  data,
}: NodeProps<{ label: string; subtitle?: string; url: string }>) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-md">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-amber-700">{data.subtitle}</div>
    </div>
  )
}

export function MissingNode({
  data,
}: NodeProps<{ label: string; subtitle?: string }>) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 shadow-md">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-rose-700">{data.subtitle}</div>
    </div>
  )
}
