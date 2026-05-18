import { describe, expect, it } from 'vitest'
import { resolveHeadingSectionCommit } from '@/logic/markdownBlockCommits'
import { createHeadingSectionViewModel, normalizeMarkdownBlocks } from '@/logic/markdownBlocks'

describe('resolveHeadingSectionCommit', () => {
  it('resolves heading title edits for graph nodes', () => {
    const blocks = createHeadingSectionViewModel({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'Body',
      contentMode: 'full',
      editable: true,
    })

    expect(
      resolveHeadingSectionCommit(blocks, {
        id: 'heading:notes/current.md:intro:heading',
        text: 'Overview',
      }),
    ).toEqual({
      type: 'title',
      text: 'Overview',
    })
  })

  it('resolves fallback content edits for graph nodes', () => {
    const blocks = createHeadingSectionViewModel({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'Body',
      contentMode: 'full',
      editable: true,
    })

    expect(
      resolveHeadingSectionCommit(blocks, {
        id: 'heading:notes/current.md:intro:content',
        text: 'Updated body',
      }),
    ).toEqual({
      type: 'content',
      text: 'Updated body',
    })
  })

  it('resolves parsed content block edits with serialized markdown', () => {
    const blocks = createHeadingSectionViewModel({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      contentBlocks: normalizeMarkdownBlocks([
        {
          id: 'heading:notes/current.md:intro:block:0',
          kind: 'paragraph',
          text: 'Body',
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

    const resolution = resolveHeadingSectionCommit(blocks, {
      id: 'heading:notes/current.md:intro:block:1',
      text: '- First\n- Second',
    })

    expect(resolution).toEqual({
      type: 'blocks',
      text: 'Body\n\n- First\n- Second',
      blocks: [
        {
          id: 'heading:notes/current.md:intro:block:0',
          kind: 'paragraph',
          text: 'Body',
          editable: true,
        },
        {
          id: 'heading:notes/current.md:intro:block:1',
          kind: 'list',
          ordered: false,
          items: ['First', 'Second'],
          editable: true,
        },
      ],
    })
  })

  it('ignores read-only or unknown graph block edits', () => {
    const blocks = createHeadingSectionViewModel({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'Summary only',
      contentMode: 'summary',
      editable: true,
    })

    expect(
      resolveHeadingSectionCommit(blocks, {
        id: 'heading:notes/current.md:intro:content',
        text: 'Updated summary',
      }),
    ).toEqual({ type: 'none' })

    expect(
      resolveHeadingSectionCommit(blocks, {
        id: 'missing',
        text: 'Nope',
      }),
    ).toEqual({ type: 'none' })
  })
})
