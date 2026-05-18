import { describe, expect, it } from 'vitest'
import { hasEditableFocus, insertPlainTextAtSelection } from '@/components/markdown/editableDom'

describe('editableDom', () => {
  it('detects focus inside an editable root', () => {
    const root = document.createElement('div')
    const input = document.createElement('button')
    root.append(input)
    document.body.append(root)

    input.focus()

    expect(hasEditableFocus(root)).toBe(true)
    expect(hasEditableFocus(input)).toBe(true)

    root.remove()
  })

  it('inserts plain text into the current selection inside the editable root', () => {
    const root = document.createElement('div')
    root.textContent = 'Alpha'
    document.body.append(root)

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(insertPlainTextAtSelection(root, '<strong>Beta</strong>')).toBe(true)
    expect(root.textContent).toBe('Alpha<strong>Beta</strong>')
    expect(root.querySelector('strong')).toBeNull()

    root.remove()
  })

  it('refuses to insert when the current selection is outside the editable root', () => {
    const root = document.createElement('div')
    const other = document.createElement('div')
    root.textContent = 'Alpha'
    other.textContent = 'Other'
    document.body.append(root, other)

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(other)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(insertPlainTextAtSelection(root, 'Beta')).toBe(false)
    expect(root.textContent).toBe('Alpha')
    expect(other.textContent).toBe('Other')

    root.remove()
    other.remove()
  })
})
