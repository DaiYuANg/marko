export type MarkdownBlockContentMode = 'none' | 'summary' | 'full'

export type MarkdownBlock =
  | {
      id: string
      kind: 'heading'
      level: number
      text: string
      editable: boolean
    }
  | {
      id: string
      kind: 'paragraph'
      text: string
      editable: boolean
    }
  | {
      id: string
      kind: 'blockquote'
      text: string
      editable: boolean
    }
  | {
      id: string
      kind: 'code'
      text: string
      language?: string
      editable: boolean
    }
  | {
      id: string
      kind: 'list'
      ordered: boolean
      items: string[]
      editable: boolean
    }
  | {
      id: string
      kind: 'divider'
      editable: boolean
    }

export type MarkdownBlockCommit = {
  id: string
  text: string
}

type HeadingSectionBlocksArgs = {
  headingId: string
  level: number
  title: string
  content?: string
  contentBlocks?: MarkdownBlock[]
  contentMode: MarkdownBlockContentMode
  editable: boolean
}

export const createHeadingSectionBlocks = ({
  headingId,
  level,
  title,
  content,
  contentBlocks,
  contentMode,
  editable,
}: HeadingSectionBlocksArgs): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [
    {
      id: `${headingId}:heading`,
      kind: 'heading',
      level,
      text: title,
      editable,
    },
  ]

  if (contentMode === 'full' && contentBlocks?.length) {
    blocks.push(
      ...contentBlocks.map((block) => ({
        ...block,
        editable: false,
      })),
    )
    return blocks
  }

  const displayContent = formatContentForMode(content, contentMode)
  if (displayContent) {
    blocks.push({
      id: `${headingId}:content`,
      kind: 'paragraph',
      text: displayContent,
      editable: editable && contentMode === 'full',
    })
  }

  return blocks
}

export const formatContentForMode = (
  content: string | undefined,
  mode: MarkdownBlockContentMode,
) => {
  const raw = content?.trim() ?? ''
  if (!raw || mode === 'none') return ''
  if (mode === 'full') return raw
  return raw.length > 140 ? `${raw.slice(0, 140).trimEnd()}...` : raw
}

type MarkdownBlockInput = {
  id: string
  kind: 'paragraph' | 'blockquote' | 'code' | 'list' | 'divider'
  text?: string | null
  language?: string | null
  ordered?: boolean | null
  items?: string[] | null
}

export const normalizeMarkdownBlocks = (
  blocks: MarkdownBlockInput[] | undefined,
): MarkdownBlock[] => {
  if (!blocks) return []

  return blocks.flatMap((block): MarkdownBlock[] => {
    if (block.kind === 'divider') {
      return [{ id: block.id, kind: 'divider', editable: false }]
    }
    if (block.kind === 'list') {
      const items = block.items?.filter((item) => item.trim()) ?? []
      if (items.length === 0) return []
      return [
        {
          id: block.id,
          kind: 'list',
          ordered: Boolean(block.ordered),
          items,
          editable: false,
        },
      ]
    }

    const text = block.text?.trim()
    if (!text) return []
    if (block.kind === 'code') {
      return [
        {
          id: block.id,
          kind: 'code',
          text,
          language: block.language ?? undefined,
          editable: false,
        },
      ]
    }
    return [
      {
        id: block.id,
        kind: block.kind,
        text,
        editable: false,
      },
    ]
  })
}
