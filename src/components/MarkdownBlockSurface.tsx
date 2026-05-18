import { memo } from 'react'
import type {
  MarkdownBlock,
  MarkdownBlockCommit,
  MarkdownBlockViewModel,
} from '@/logic/markdownBlocks'
import MarkdownBlockquoteView from '@/components/markdown/MarkdownBlockquoteView'
import MarkdownCodeBlockView from '@/components/markdown/MarkdownCodeBlockView'
import MarkdownDividerView from '@/components/markdown/MarkdownDividerView'
import MarkdownHeadingView from '@/components/markdown/MarkdownHeadingView'
import MarkdownListView from '@/components/markdown/MarkdownListView'
import MarkdownParagraphView from '@/components/markdown/MarkdownParagraphView'
import { useEditableCommit } from '@/components/markdown/useEditableCommit'

type MarkdownBlockSurfaceProps = {
  blocks: Array<MarkdownBlock | MarkdownBlockViewModel>
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}

const MarkdownBlockSurface = ({ blocks, onCommitBlock }: MarkdownBlockSurfaceProps) => {
  const interactive = blocks.some((block) => block.editable)

  return (
    <div
      className={interactive ? 'nodrag nopan space-y-1.5' : 'space-y-1.5'}
      onClick={(event) => {
        if (!interactive) return
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        if (!interactive) return
        event.stopPropagation()
      }}
      onPointerDown={(event) => {
        if (!interactive) return
        event.stopPropagation()
      }}
    >
      {blocks.map((block) => (
        <MarkdownSurfaceBlock key={block.id} block={block} onCommitBlock={onCommitBlock} />
      ))}
    </div>
  )
}

export default memo(MarkdownBlockSurface)

const MarkdownSurfaceBlock = ({
  block,
  onCommitBlock,
}: {
  block: MarkdownBlock | MarkdownBlockViewModel
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}) => {
  if (block.kind === 'heading') {
    return (
      <MarkdownHeadingBlock
        level={block.level}
        value={block.text}
        editable={block.editable}
        compact
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
    return (
      <MarkdownCodeBlockView
        text={block.text}
        language={block.language}
        editable={block.editable}
        onCommit={(text) => onCommitBlock?.({ id: block.id, text })}
      />
    )
  }
  if (block.kind === 'list') {
    return (
      <MarkdownListItemsBlock
        ordered={block.ordered}
        items={block.items}
        editable={block.editable}
        onCommit={(text) => onCommitBlock?.({ id: block.id, text })}
      />
    )
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

const MarkdownHeadingBlock = ({
  level,
  value,
  editable,
  compact,
  onCommit,
}: {
  level: number
  value: string
  editable: boolean
  compact?: boolean
  onCommit?: (value: string) => void
}) => {
  return (
    <MarkdownHeadingView
      level={level}
      text={value}
      editable={editable}
      compact={compact}
      onCommit={onCommit}
    />
  )
}

const MarkdownContentBlock = ({
  value,
  editable,
  onCommit,
}: {
  value: string
  editable: boolean
  onCommit?: (value: string) => void
}) => {
  return <MarkdownParagraphView text={value} editable={editable} compact onCommit={onCommit} />
}

const MarkdownListItemsBlock = ({
  ordered,
  items,
  editable,
  onCommit,
}: {
  ordered: boolean
  items: string[]
  editable: boolean
  onCommit?: (value: string) => void
}) => {
  const ListTag = ordered ? 'ol' : 'ul'
  const editableHandlers = useEditableCommit<HTMLElement>({
    value: items.join('\n'),
    onCommit,
    readValue: readListText,
    resetOnEscape: false,
  })

  return (
    <MarkdownListView ordered={ordered}>
      <ListTag
        key={items.join('\n')}
        className={`m-0 space-y-1 rounded-sm pl-5 outline-none focus:bg-background focus:ring-1 focus:ring-ring ${ordered ? 'list-decimal' : 'list-disc'}`}
        contentEditable={editable}
        suppressContentEditableWarning
        {...editableHandlers}
      >
        {items.map((item, index) => (
          <li key={`${index}:${item}`} className="text-xs leading-5 text-muted-foreground">
            {item}
          </li>
        ))}
      </ListTag>
    </MarkdownListView>
  )
}

const readListText = (element: HTMLElement) => {
  const listItems = Array.from(element.querySelectorAll('li'))
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean)

  if (listItems.length > 0) return listItems.join('\n')

  return (element.textContent ?? '')
    .split(/\r\n|\r|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
}
