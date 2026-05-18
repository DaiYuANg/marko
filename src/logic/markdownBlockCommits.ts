import {
  serializeMarkdownBlocks,
  updateMarkdownBlockText,
  type MarkdownBlock,
  type MarkdownBlockCommit,
  type MarkdownBlockViewModel,
} from '@/logic/markdownBlocks'

export type HeadingSectionCommitResolution =
  | {
      type: 'none'
    }
  | {
      type: 'title'
      text: string
    }
  | {
      type: 'content'
      text: string
    }
  | {
      type: 'blocks'
      blocks: MarkdownBlock[]
      text: string
    }

export const resolveHeadingSectionCommit = (
  blocks: MarkdownBlockViewModel[],
  commit: MarkdownBlockCommit,
): HeadingSectionCommitResolution => {
  const committedBlock = blocks.find((block) => block.id === commit.id)
  if (!committedBlock || committedBlock.commitTarget === 'none') return { type: 'none' }

  if (committedBlock.commitTarget === 'title') {
    return {
      type: 'title',
      text: commit.text,
    }
  }

  if (committedBlock.commitTarget === 'content') {
    return {
      type: 'content',
      text: commit.text,
    }
  }

  const contentBlocks = blocks.filter(isContentBlock).map(toMarkdownBlock)
  const nextBlocks = updateMarkdownBlockText(contentBlocks, commit)
  if (!nextBlocks) return { type: 'none' }

  return {
    type: 'blocks',
    blocks: nextBlocks,
    text: serializeMarkdownBlocks(nextBlocks),
  }
}

const isContentBlock = (block: MarkdownBlockViewModel) => {
  return block.role === 'content'
}

const toMarkdownBlock = (block: MarkdownBlockViewModel): MarkdownBlock => {
  if (block.kind === 'heading') {
    return {
      id: block.id,
      kind: 'heading',
      level: block.level,
      text: block.text,
      editable: block.editable,
    }
  }

  if (block.kind === 'list') {
    return {
      id: block.id,
      kind: 'list',
      ordered: block.ordered,
      items: block.items,
      editable: block.editable,
    }
  }

  if (block.kind === 'code') {
    return {
      id: block.id,
      kind: 'code',
      text: block.text,
      language: block.language,
      editable: block.editable,
    }
  }

  if (block.kind === 'divider') {
    return {
      id: block.id,
      kind: 'divider',
      editable: block.editable,
    }
  }

  return {
    id: block.id,
    kind: block.kind,
    text: block.text,
    editable: block.editable,
  }
}
