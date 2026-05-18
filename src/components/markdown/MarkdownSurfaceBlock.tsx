import { memo } from 'react'
import type {
  MarkdownBlock,
  MarkdownBlockCommit,
  MarkdownBlockViewModel,
} from '@/logic/markdownBlocks'
import MarkdownBlockquoteView from '@/components/markdown/MarkdownBlockquoteView'
import MarkdownCodeBlockView from '@/components/markdown/MarkdownCodeBlockView'
import MarkdownDividerView from '@/components/markdown/MarkdownDividerView'
import MarkdownEditableList from '@/components/markdown/MarkdownEditableList'
import MarkdownHeadingView from '@/components/markdown/MarkdownHeadingView'
import MarkdownParagraphView from '@/components/markdown/MarkdownParagraphView'

type MarkdownSurfaceBlockProps = {
  block: MarkdownBlock | MarkdownBlockViewModel
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}

const MarkdownSurfaceBlock = ({ block, onCommitBlock }: MarkdownSurfaceBlockProps) => {
  const commitBlock = (text: string) => onCommitBlock?.({ id: block.id, text })

  if (block.kind === 'heading') {
    return (
      <MarkdownHeadingView
        level={block.level}
        text={block.text}
        editable={block.editable}
        compact
        onCommit={commitBlock}
      />
    )
  }

  if (block.kind === 'blockquote') {
    return (
      <MarkdownBlockquoteView text={block.text} editable={block.editable} onCommit={commitBlock} />
    )
  }

  if (block.kind === 'code') {
    return (
      <MarkdownCodeBlockView
        text={block.text}
        language={block.language}
        editable={block.editable}
        onCommit={commitBlock}
      />
    )
  }

  if (block.kind === 'list') {
    return (
      <MarkdownEditableList
        ordered={block.ordered}
        items={block.items}
        editable={block.editable}
        onCommit={commitBlock}
      />
    )
  }

  if (block.kind === 'divider') {
    return <MarkdownDividerView />
  }

  return (
    <MarkdownParagraphView
      text={block.text}
      editable={block.editable}
      compact
      onCommit={commitBlock}
    />
  )
}

export default memo(MarkdownSurfaceBlock)
