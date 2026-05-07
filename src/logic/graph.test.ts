import { describe, expect, it } from 'vitest'
import { buildGraphFromWorkspaceIndex } from '@/logic/graph'
import type { FsWorkspaceIndex } from '@/services/fsApi'

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
})
