import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { FOCUS_SOURCE_POSITION_EVENT } from '@/utils/editorNavigation'

type CompletionProviderMock = {
  provideCompletionItems: (
    model: { getValue: () => string },
    position: { lineNumber: number; column: number },
  ) => {
    suggestions: Array<Record<string, unknown>>
  }
}

const monacoEditor = vi.hoisted(() => ({
  setPosition: vi.fn(),
  revealLineInCenter: vi.fn(),
  focus: vi.fn(),
}))

const monaco = vi.hoisted(() => ({
  Range: class Range {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number

    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    ) {
      this.startLineNumber = startLineNumber
      this.startColumn = startColumn
      this.endLineNumber = endLineNumber
      this.endColumn = endColumn
    }
  },
  languages: {
    CompletionItemKind: {
      File: 1,
      Reference: 2,
      Keyword: 3,
    },
    registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    onMount,
    onChange,
    value,
  }: {
    onMount?: (editor: typeof monacoEditor, monacoApi: typeof monaco) => void
    onChange?: (value?: string) => void
    value: string
  }) => {
    onMount?.(monacoEditor, monaco)
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
  monaco.languages.registerCompletionItemProvider.mockClear()
})

describe('MarkdownSourceEditor', () => {
  it('registers workspace-aware markdown completions', () => {
    render(
      <MarkdownSourceEditor
        activePath="notes/current.md"
        value="See [Target]("
        files={[
          { path: 'notes/current.md', kind: 'file' },
          { path: 'notes/target.md', kind: 'file' },
        ]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    const providerCall = monaco.languages.registerCompletionItemProvider.mock
      .calls[0] as unknown as [string, CompletionProviderMock] | undefined
    expect(providerCall?.[0]).toBe('markdown')

    const provider = providerCall?.[1]
    const result = provider?.provideCompletionItems(
      { getValue: () => 'See [Target](' },
      { lineNumber: 1, column: 14 },
    )

    expect(result?.suggestions[1]).toMatchObject({
      label: 'target',
      insertText: 'target.md',
      detail: 'notes/target.md',
      range: {
        startLineNumber: 1,
        startColumn: 14,
        endLineNumber: 1,
        endColumn: 14,
      },
    })
  })

  it('focuses the requested source position for the active file', () => {
    render(
      <MarkdownSourceEditor
        activePath="source.md"
        value="a\nb\nc"
        files={[]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

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
    render(
      <MarkdownSourceEditor
        activePath="source.md"
        value="a\nb\nc"
        files={[]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    window.dispatchEvent(
      new CustomEvent(FOCUS_SOURCE_POSITION_EVENT, {
        detail: { path: 'other.md', line: 1, column: 1 },
      }),
    )

    expect(monacoEditor.setPosition).not.toHaveBeenCalled()
  })
})
