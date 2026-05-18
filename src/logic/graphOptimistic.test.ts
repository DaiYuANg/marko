import { describe, expect, it } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { patchGraphHeadingContent, patchGraphHeadingTitle } from '@/logic/graphOptimistic'

const createGraph = (): GraphData => ({
  nodes: [
    {
      id: 'heading:notes/current.md:intro',
      type: 'heading',
      data: {
        label: 'Intro',
        content: 'Body',
        contentStartLine: 2,
        contentEndLine: 3,
        contentBlocks: [
          {
            id: 'heading:notes/current.md:intro:block:0',
            kind: 'paragraph',
            text: 'Body',
            editable: false,
          },
        ],
      },
      position: { x: 0, y: 0 },
    },
    {
      id: 'heading:notes/current.md:next',
      type: 'heading',
      data: {
        label: 'Next',
        line: 3,
        contentStartLine: 4,
        contentEndLine: 4,
      },
      position: { x: 0, y: 120 },
    },
  ],
  edges: [],
  layoutKey: 'outline:file',
})

describe('graph optimistic patches', () => {
  it('patches heading titles without changing layout metadata', () => {
    const graph = createGraph()
    const next = patchGraphHeadingTitle(graph, 'heading:notes/current.md:intro', 'Updated')

    expect(next).not.toBe(graph)
    expect(next.layoutKey).toBe('outline:file')
    expect(next.nodes[0].data.label).toBe('Updated')
  })

  it('patches heading content and parsed blocks for inline graph edits', () => {
    const graph = createGraph()
    const nextBlocks = [
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'code' as const,
        text: 'const value = 2',
        language: 'ts',
        editable: true,
      },
    ]
    const next = patchGraphHeadingContent(
      graph,
      'heading:notes/current.md:intro',
      '```ts\nconst value = 2\n```',
      nextBlocks,
    )

    expect(next.nodes[0].data.content).toBe('```ts\nconst value = 2\n```')
    expect(next.nodes[0].data.contentBlocks).toEqual(nextBlocks)
  })

  it('keeps later heading line ranges aligned when content line counts change', () => {
    const graph = createGraph()
    const next = patchGraphHeadingContent(
      graph,
      'heading:notes/current.md:intro',
      'Line one\nLine two\nLine three',
    )

    expect(next.nodes[0].data.contentEndLine).toBe(5)
    expect(next.nodes[1].data.line).toBe(5)
    expect(next.nodes[1].data.contentStartLine).toBe(6)
    expect(next.nodes[1].data.contentEndLine).toBe(6)
  })

  it('returns the same graph when the target is missing', () => {
    const graph = createGraph()

    expect(patchGraphHeadingTitle(graph, 'missing', 'Updated')).toBe(graph)
    expect(patchGraphHeadingContent(graph, 'missing', 'Updated')).toBe(graph)
  })
})
