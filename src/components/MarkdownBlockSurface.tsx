import { memo } from 'react'
import type { MarkdownBlock, MarkdownBlockCommit } from '@/logic/markdownBlocks'
import MarkdownBlockquoteView from '@/components/markdown/MarkdownBlockquoteView'
import MarkdownCodeBlockView from '@/components/markdown/MarkdownCodeBlockView'
import MarkdownDividerView from '@/components/markdown/MarkdownDividerView'
import MarkdownHeadingView from '@/components/markdown/MarkdownHeadingView'
import MarkdownListView from '@/components/markdown/MarkdownListView'
import MarkdownParagraphView from '@/components/markdown/MarkdownParagraphView'

type MarkdownBlockSurfaceProps = {
  blocks: MarkdownBlock[]
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}

function MarkdownBlockSurface({ blocks, onCommitBlock }: MarkdownBlockSurfaceProps) {
  return (
    <div className="space-y-1.5">
      {blocks.map((block) => (
        <MarkdownSurfaceBlock key={block.id} block={block} onCommitBlock={onCommitBlock} />
      ))}
    </div>
  )
}

export default memo(MarkdownBlockSurface)

function MarkdownSurfaceBlock({
  block,
  onCommitBlock,
}: {
  block: MarkdownBlock
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}) {
  if (block.kind === 'heading') {
    return (
      <MarkdownHeadingBlock
        level={block.level}
        value={block.text}
        editable={block.editable}
        onCommit={(text) => onCommitBlock?.({ id: block.id, text })}
      />
    )
  }
  if (block.kind === 'blockquote') {
    return (
      <MarkdownBlockquoteView
        text={block.text}
        editable={block.editable}
        onCommit={(text) => onCommitBlock?.({ id: block.id, text })}
      />
    )
  }
  if (block.kind === 'code') {
    return <MarkdownCodeBlockView text={block.text} language={block.language} />
  }
  if (block.kind === 'list') {
    return <MarkdownListItemsBlock ordered={block.ordered} items={block.items} />
  }
  if (block.kind === 'divider') {
    return <MarkdownDividerView />
  }

  return (
    <MarkdownContentBlock
      value={block.text}
      editable={block.editable}
      onCommit={(text) => onCommitBlock?.({ id: block.id, text })}
    />
  )
}

function MarkdownHeadingBlock({
  level,
  value,
  editable,
  onCommit,
}: {
  level: number
  value: string
  editable: boolean
  onCommit?: (value: string) => void
}) {
  return <MarkdownHeadingView level={level} text={value} editable={editable} onCommit={onCommit} />
}

function MarkdownContentBlock({
  value,
  editable,
  onCommit,
}: {
  value: string
  editable: boolean
  onCommit?: (value: string) => void
}) {
  return <MarkdownParagraphView text={value} editable={editable} compact onCommit={onCommit} />
}

function MarkdownListItemsBlock({ ordered, items }: { ordered: boolean; items: string[] }) {
  const ListTag = ordered ? 'ol' : 'ul'
  return (
    <MarkdownListView ordered={ordered}>
      <ListTag className={`m-0 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
        {items.map((item, index) => (
          <li key={`${index}:${item}`} className="text-xs leading-5 text-muted-foreground">
            {item}
          </li>
        ))}
      </ListTag>
    </MarkdownListView>
  )
}
