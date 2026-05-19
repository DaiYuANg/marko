import type { Node } from '@xyflow/react'

export const mergeGraphNodePositions = <T extends Record<string, unknown>>(
  nextNodes: Node<T>[],
  currentNodes: Node<T>[],
  preservePositions: boolean,
) => {
  if (!preservePositions) return nextNodes

  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  return nextNodes.map((node) => {
    const current = currentById.get(node.id)
    if (!current) return node

    return {
      ...node,
      position: current.position,
      selected: current.selected,
      dragging: current.dragging,
    }
  })
}
