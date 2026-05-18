import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownBlockSurface from '@/components/MarkdownBlockSurface'
import type { MarkdownBlock } from '@/logic/markdownBlocks'

describe('MarkdownBlockSurface', () => {
  it('commits edited block text with the source block id', () => {
    const onCommitBlock = vi.fn()
    const blocks: MarkdownBlock[] = [
      {
        id: 'heading:notes/a.md:intro:heading',
        kind: 'heading',
        level: 2,
        text: 'Intro',
        editable: true,
      },
    ]

    render(<MarkdownBlockSurface blocks={blocks} onCommitBlock={onCommitBlock} />)

    const heading = screen.getByText('Intro')
    heading.textContent = 'Overview'
    fireEvent.blur(heading)

    expect(onCommitBlock).toHaveBeenCalledWith({
      id: 'heading:notes/a.md:intro:heading',
      text: 'Overview',
    })
  })

  it('commits edited list block text with the source block id', () => {
    const onCommitBlock = vi.fn()
    const blocks: MarkdownBlock[] = [
      {
        id: 'heading:notes/a.md:intro:block:0',
        kind: 'list',
        ordered: false,
        items: ['Alpha', 'Beta'],
        editable: true,
      },
    ]

    render(<MarkdownBlockSurface blocks={blocks} onCommitBlock={onCommitBlock} />)

    const list = screen.getByRole('list')
    list.replaceChildren(createTestListItem('One'), createTestListItem('Two'))
    fireEvent.blur(list)

    expect(onCommitBlock).toHaveBeenCalledWith({
      id: 'heading:notes/a.md:intro:block:0',
      text: 'One\nTwo',
    })
  })
})

const createTestListItem = (text: string) => {
  const listItem = document.createElement('li')
  listItem.textContent = text
  return listItem
}
