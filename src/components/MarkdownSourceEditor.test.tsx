import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { FOCUS_SOURCE_POSITION_EVENT } from '@/utils/editorNavigation'

const monacoEditor = vi.hoisted(() => ({
  setPosition: vi.fn(),
  revealLineInCenter: vi.fn(),
  focus: vi.fn(),
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    onMount,
    onChange,
    value,
  }: {
    onMount?: (editor: typeof monacoEditor) => void
    onChange?: (value?: string) => void
    value: string
  }) => {
    onMount?.(monacoEditor)
    return (
      <textarea
        aria-label="markdown source"
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    )
  },
}))

beforeEach(() => {
  monacoEditor.setPosition.mockClear()
  monacoEditor.revealLineInCenter.mockClear()
  monacoEditor.focus.mockClear()
})

describe('MarkdownSourceEditor', () => {
  it('focuses the requested source position for the active file', () => {
    render(<MarkdownSourceEditor activePath="source.md" value="a\nb\nc" onChange={vi.fn()} />)

    window.dispatchEvent(
      new CustomEvent(FOCUS_SOURCE_POSITION_EVENT, {
        detail: { path: 'source.md', line: 3, column: 2 },
      }),
    )

    expect(monacoEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 2 })
    expect(monacoEditor.revealLineInCenter).toHaveBeenCalledWith(3)
    expect(monacoEditor.focus).toHaveBeenCalled()
  })

  it('ignores source focus requests for other files', () => {
    render(<MarkdownSourceEditor activePath="source.md" value="a\nb\nc" onChange={vi.fn()} />)

    window.dispatchEvent(
      new CustomEvent(FOCUS_SOURCE_POSITION_EVENT, {
        detail: { path: 'other.md', line: 1, column: 1 },
      }),
    )

    expect(monacoEditor.setPosition).not.toHaveBeenCalled()
  })
})
