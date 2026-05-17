import { describe, expect, it } from 'vitest'
import { buildGraphFromRustGraph, buildGraphFromWorkspaceIndex } from '@/logic/graph'
import type { FsGraph, FsWorkspaceIndex } from '@/services/fsApi'

describe('buildGraphFromWorkspaceIndex', () => {
  it('builds file, heading, and normalized link edges from the Rust index shape', () => {
    const graph = buildGraphFromWorkspaceIndex({
      files: [
        {
          path: 'notes/current.md',
          headings: [
            { path: 'notes/current.md', level: 1, text: 'Current', slug: 'current', line: 1 },
          ],
          links: [
            {
              source_path: 'notes/current.md',
              text: 'Details',
              target: 'target.md#details',
              link_type: 'markdown',
              target_path: 'notes/target.md',
              target_anchor: 'details',
              target_heading_slug: 'details',
              is_external: false,
              context: 'See [Details](target.md#details)',
              line: 2,
              column: 5,
            },
          ],
        },
        {
          path: 'notes/target.md',
          headings: [
            { path: 'notes/target.md', level: 2, text: 'Details', slug: 'details', line: 3 },
          ],
          links: [],
        },
      ],
    } satisfies FsWorkspaceIndex)

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['file:notes/current.md', 'heading:notes/target.md:details']),
    )
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'file:notes/current.md',
          target: 'heading:notes/target.md:details',
        }),
      ]),
    )
  })

  it('maps Rust outline graph nodes to React Flow nodes', () => {
    const graph = buildGraphFromRustGraph({
      mode: 'outline',
      nodes: [
        {
          id: 'file:notes/current.md',
          kind: 'file',
          label: 'current',
          path: 'notes/current.md',
        },
        {
          id: 'heading:notes/current.md:intro',
          kind: 'heading',
          label: 'Intro',
          path: 'notes/current.md',
          line: 1,
          level: 1,
          slug: 'intro',
        },
      ],
      edges: [
        {
          id: 'file:notes/current.md->heading:notes/current.md:intro-0',
          source: 'file:notes/current.md',
          target: 'heading:notes/current.md:intro',
          kind: 'contains',
        },
      ],
    } satisfies FsGraph)

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'heading:notes/current.md:intro',
          type: 'heading',
          data: expect.objectContaining({ label: 'Intro', subtitle: 'H1', line: 1 }),
        }),
      ]),
    )
    expect(graph.edges[0]).toEqual(expect.objectContaining({ type: 'smoothstep' }))
  })
})
