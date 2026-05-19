import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { mergeGraphNodePositions } from '@/logic/graphViewState'

type TestNodeData = {
  label: string
}

const createNode = (id: string, x: number, y: number, label = id): Node<TestNodeData> => ({
  id,
  data: { label },
  position: { x, y },
})

describe('mergeGraphNodePositions', () => {
  it('keeps current positions for matching nodes when preserving is enabled', () => {
    const currentNodes = [
      { ...createNode('a', 120, 80), selected: true },
      createNode('b', 240, 160),
    ]
    const nextNodes = [createNode('a', 0, 0, 'Updated'), createNode('b', 10, 10)]

    expect(mergeGraphNodePositions(nextNodes, currentNodes, true)).toEqual([
      {
        ...nextNodes[0],
        position: { x: 120, y: 80 },
        selected: true,
        dragging: undefined,
      },
      {
        ...nextNodes[1],
        position: { x: 240, y: 160 },
        selected: undefined,
        dragging: undefined,
      },
    ])
  })

  it('uses next layout positions when preserving is disabled', () => {
    const currentNodes = [createNode('a', 120, 80)]
    const nextNodes = [createNode('a', 0, 0, 'Updated')]

    expect(mergeGraphNodePositions(nextNodes, currentNodes, false)).toBe(nextNodes)
  })

  it('keeps new nodes at their next layout position', () => {
    const currentNodes = [createNode('a', 120, 80)]
    const nextNodes = [createNode('a', 0, 0), createNode('b', 320, 240)]

    expect(mergeGraphNodePositions(nextNodes, currentNodes, true)[1].position).toEqual({
      x: 320,
      y: 240,
    })
  })
})
