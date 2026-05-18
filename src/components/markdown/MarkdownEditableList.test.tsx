import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownEditableList, {
  readMarkdownListText,
} from '@/components/markdown/MarkdownEditableList'

describe('MarkdownEditableList', () => {
  it('syncs external item changes without remounting the list element', () => {
    const { rerender } = render(
      <MarkdownEditableList editable items={['Alpha', 'Beta']} ordered={false} />,
    )
    const list = screen.getByRole('list')

    rerender(<MarkdownEditableList editable items={['Alpha', 'Gamma']} ordered={false} />)

    expect(screen.getByRole('list')).toBe(list)
    expect(readMarkdownListText(list)).toBe('Alpha\nGamma')
  })

  it('does not overwrite focused list content during a parent rerender', () => {
    const { rerender } = render(
      <MarkdownEditableList editable items={['Alpha', 'Beta']} ordered={false} />,
    )
    const list = screen.getByRole('list')
    list.focus()
    list.replaceChildren(createTestListItem('Local draft'))

    rerender(<MarkdownEditableList editable items={['External update']} ordered={false} />)

    expect(readMarkdownListText(list)).toBe('Local draft')
  })

  it('commits list items on blur', () => {
    const onCommit = vi.fn()
    render(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Beta']}
        ordered={false}
        onCommit={onCommit}
      />,
    )

    const list = screen.getByRole('list')
    list.replaceChildren(createTestListItem('One'), createTestListItem('Two'))
    fireEvent.blur(list)

    expect(onCommit).toHaveBeenCalledWith('One\nTwo')
  })

  it('reads plain text nodes as list lines after plain-text paste fallback', () => {
    render(<MarkdownEditableList editable items={['Alpha']} ordered={false} />)

    const list = screen.getByRole('list')
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(list)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.paste(list, {
      clipboardData: {
        getData: () => '\nBeta\nGamma',
      },
    })

    expect(readMarkdownListText(list)).toBe('Alpha\nBeta\nGamma')
  })

  it('applies deferred external items on blur when focused content was unchanged', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Beta']}
        ordered={false}
        onCommit={onCommit}
      />,
    )

    const list = screen.getByRole('list')
    list.focus()
    fireEvent.focus(list)

    rerender(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Gamma']}
        ordered={false}
        onCommit={onCommit}
      />,
    )
    fireEvent.blur(list)

    expect(readMarkdownListText(list)).toBe('Alpha\nGamma')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('keeps local list edits over deferred external items on blur', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Beta']}
        ordered={false}
        onCommit={onCommit}
      />,
    )

    const list = screen.getByRole('list')
    list.focus()
    fireEvent.focus(list)

    rerender(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Gamma']}
        ordered={false}
        onCommit={onCommit}
      />,
    )
    list.replaceChildren(createTestListItem('Local'), createTestListItem('Draft'))
    fireEvent.blur(list)

    expect(readMarkdownListText(list)).toBe('Local\nDraft')
    expect(onCommit).toHaveBeenCalledWith('Local\nDraft')
  })

  it('resets to latest external items on Escape without committing', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Beta']}
        ordered={false}
        onCommit={onCommit}
      />,
    )

    const list = screen.getByRole('list')
    list.focus()
    fireEvent.focus(list)

    rerender(
      <MarkdownEditableList
        editable
        items={['Alpha', 'Gamma']}
        ordered={false}
        onCommit={onCommit}
      />,
    )
    list.replaceChildren(createTestListItem('Local'), createTestListItem('Draft'))
    fireEvent.keyDown(list, { key: 'Escape' })

    expect(readMarkdownListText(list)).toBe('Alpha\nGamma')
    expect(onCommit).not.toHaveBeenCalled()
  })
})

const createTestListItem = (text: string) => {
  const listItem = document.createElement('li')
  listItem.textContent = text
  return listItem
}
