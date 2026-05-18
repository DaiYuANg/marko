import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownEditableText from '@/components/markdown/MarkdownEditableText'

describe('MarkdownEditableText', () => {
  it('syncs external value changes without remounting the editable element', () => {
    const { rerender } = render(
      <MarkdownEditableText data-testid="editable" editable value="Alpha" />,
    )
    const element = screen.getByTestId('editable')

    rerender(<MarkdownEditableText data-testid="editable" editable value="Beta" />)

    expect(screen.getByTestId('editable')).toBe(element)
    expect(element).toHaveTextContent('Beta')
  })

  it('commits edited text on blur', () => {
    const onCommit = vi.fn()
    render(
      <MarkdownEditableText data-testid="editable" editable value="Alpha" onCommit={onCommit} />,
    )

    const element = screen.getByTestId('editable')
    element.textContent = 'Beta'
    fireEvent.blur(element)

    expect(onCommit).toHaveBeenCalledWith('Beta')
  })

  it('waits for composition end before committing a blurred IME edit', () => {
    const onCommit = vi.fn()
    render(
      <MarkdownEditableText data-testid="editable" editable value="输入" onCommit={onCommit} />,
    )

    const element = screen.getByTestId('editable')
    fireEvent.compositionStart(element)
    element.textContent = '输入法'
    fireEvent.blur(element)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.compositionEnd(element)

    expect(onCommit).toHaveBeenCalledWith('输入法')
  })

  it('can normalize and reject an empty commit', () => {
    const onCommit = vi.fn()
    render(
      <MarkdownEditableText
        data-testid="editable"
        editable
        value="Heading"
        normalizeValue={(value) => value.trim()}
        rejectEmpty
        onCommit={onCommit}
      />,
    )

    const element = screen.getByTestId('editable')
    element.textContent = '   '
    fireEvent.blur(element)

    expect(onCommit).not.toHaveBeenCalled()
    expect(element).toHaveTextContent('Heading')
  })

  it('inserts pasted content as plain text', () => {
    render(<MarkdownEditableText data-testid="editable" editable value="Alpha" />)

    const element = screen.getByTestId('editable')
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.paste(element, {
      clipboardData: {
        getData: () => '<strong>Beta</strong>',
      },
    })

    expect(element).toHaveTextContent('Alpha<strong>Beta</strong>')
    expect(element.querySelector('strong')).toBeNull()
  })
})
