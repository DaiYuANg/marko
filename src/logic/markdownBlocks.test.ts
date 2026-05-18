import { describe, expect, it } from 'vitest'
import { createHeadingSectionBlocks, normalizeMarkdownBlocks } from '@/logic/markdownBlocks'

describe('createHeadingSectionBlocks', () => {
  it('creates editable heading and full content blocks', () => {
    expect(
      createHeadingSectionBlocks({
        headingId: 'heading:notes/current.md:intro',
        level: 2,
        title: 'Intro',
        content: 'Body',
        contentMode: 'full',
        editable: true,
      }),
    ).toEqual([
      {
        id: 'heading:notes/current.md:intro:heading',
        kind: 'heading',
        level: 2,
        text: 'Intro',
        editable: true,
      },
      {
        id: 'heading:notes/current.md:intro:content',
        kind: 'paragraph',
        text: 'Body',
        editable: true,
      },
    ])
  })

  it('keeps summarized content read-only', () => {
    const blocks = createHeadingSectionBlocks({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'A'.repeat(160),
      contentMode: 'summary',
      editable: true,
    })

    expect(blocks[1]).toEqual(
      expect.objectContaining({
        kind: 'paragraph',
        text: `${'A'.repeat(140)}...`,
        editable: false,
      }),
    )
  })

  it('uses rust-parsed blocks for full content mode', () => {
    const blocks = createHeadingSectionBlocks({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'Fallback',
      contentBlocks: normalizeMarkdownBlocks([
        {
          id: 'heading:notes/current.md:intro:block:0',
          kind: 'code',
          text: 'const value = 1',
          language: 'ts',
        },
        {
          id: 'heading:notes/current.md:intro:block:1',
          kind: 'list',
          ordered: false,
          items: ['One', 'Two'],
        },
      ]),
      contentMode: 'full',
      editable: true,
    })

    expect(blocks).toEqual([
      {
        id: 'heading:notes/current.md:intro:heading',
        kind: 'heading',
        level: 2,
        text: 'Intro',
        editable: true,
      },
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'code',
        text: 'const value = 1',
        language: 'ts',
        editable: false,
      },
      {
        id: 'heading:notes/current.md:intro:block:1',
        kind: 'list',
        ordered: false,
        items: ['One', 'Two'],
        editable: false,
      },
    ])
  })
})
