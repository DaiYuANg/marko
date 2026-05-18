import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { useGraphMarkdownEditing } from '@/pages/useGraphMarkdownEditing'

const headingId = 'heading:notes/current.md:intro'
const nextHeadingId = 'heading:notes/current.md:next'

const graph: GraphData = {
  nodes: [
    {
      id: headingId,
      type: 'heading',
      data: {
        label: 'Intro',
        level: 1,
        line: 1,
        content: 'Old body',
        contentStartLine: 2,
        contentEndLine: 3,
        contentBlocks: [
          {
            id: `${headingId}:block:0`,
            kind: 'paragraph',
            text: 'Old body',
            editable: true,
          },
        ],
      },
      position: { x: 0, y: 0 },
    },
    {
      id: nextHeadingId,
      type: 'heading',
      data: {
        label: 'Next',
        level: 2,
        line: 3,
        contentStartLine: 4,
        contentEndLine: 5,
      },
      position: { x: 0, y: 120 },
    },
  ],
  edges: [],
}

const Harness = () => {
  const [markdown, setMarkdown] = useState('# Intro\nOld body\n## Next\nTail\n')
  const { editorGraph, updateHeadingContent, updateHeadingTitle } = useGraphMarkdownEditing({
    graph,
    markdown,
    onChange: setMarkdown,
  })
  const firstNode = editorGraph.nodes[0]
  const secondNode = editorGraph.nodes[1]

  return (
    <div>
      <div data-testid="markdown">{markdown}</div>
      <div data-testid="title">{firstNode?.data.label}</div>
      <div data-testid="content">{firstNode?.data.content}</div>
      <div data-testid="content-blocks">
        {firstNode?.data.contentBlocks
          ?.map((block) => ('text' in block ? block.text : ''))
          .join('|')}
      </div>
      <div data-testid="next-line">{secondNode?.data.line}</div>
      <button type="button" onClick={() => updateHeadingTitle(headingId, 'Overview')}>
        title
      </button>
      <button
        type="button"
        onClick={() =>
          updateHeadingContent(headingId, 'New body', [
            {
              id: `${headingId}:block:0`,
              kind: 'paragraph',
              text: 'New body',
              editable: true,
            },
          ])
        }
      >
        content
      </button>
      <button
        type="button"
        onClick={() =>
          updateHeadingContent(headingId, 'Line one\nLine two', [
            {
              id: `${headingId}:block:0`,
              kind: 'paragraph',
              text: 'Line one\nLine two',
              editable: true,
            },
          ])
        }
      >
        multiline
      </button>
      <button type="button" onClick={() => updateHeadingTitle(nextHeadingId, 'Later')}>
        next title
      </button>
    </div>
  )
}

describe('useGraphMarkdownEditing', () => {
  it('writes heading title edits to markdown and optimistic graph state', () => {
    render(<Harness />)

    act(() => {
      screen.getByRole('button', { name: 'title' }).click()
    })

    expect(screen.getByTestId('markdown')).toHaveTextContent('# Overview Old body ## Next Tail')
    expect(screen.getByTestId('title')).toHaveTextContent('Overview')
  })

  it('writes content edits to markdown and optimistic graph state', () => {
    render(<Harness />)

    act(() => {
      screen.getByRole('button', { name: 'content' }).click()
    })

    expect(screen.getByTestId('markdown')).toHaveTextContent('# Intro New body ## Next Tail')
    expect(screen.getByTestId('content')).toHaveTextContent('New body')
    expect(screen.getByTestId('content-blocks')).toHaveTextContent('New body')
  })

  it('shifts later graph line metadata after multiline content edits', () => {
    render(<Harness />)

    act(() => {
      screen.getByRole('button', { name: 'multiline' }).click()
    })

    expect(screen.getByTestId('markdown')).toHaveTextContent(
      '# Intro Line one Line two ## Next Tail',
    )
    expect(screen.getByTestId('content')).toHaveTextContent('Line one Line two')
    expect(screen.getByTestId('next-line')).toHaveTextContent('4')
  })

  it('uses shifted optimistic line metadata for later heading title edits', () => {
    render(<Harness />)

    act(() => {
      screen.getByRole('button', { name: 'multiline' }).click()
    })
    act(() => {
      screen.getByRole('button', { name: 'next title' }).click()
    })

    expect(screen.getByTestId('markdown')).toHaveTextContent(
      '# Intro Line one Line two ## Later Tail',
    )
  })
})
