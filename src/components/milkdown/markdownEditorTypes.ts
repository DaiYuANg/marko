import type { SlashCommandLabels } from './slashMenuConfig'

export type MarkdownEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  placeholder: string
  slashLabels: SlashCommandLabels
}

export type MarkdownEditorHandle = {
  focus: () => void
  getMarkdown: () => string
}
