import MarkdownBlockquoteView from '@/components/markdown/MarkdownBlockquoteView'
import MarkdownCodeBlockView from '@/components/markdown/MarkdownCodeBlockView'
import MarkdownDividerView from '@/components/markdown/MarkdownDividerView'
import MarkdownEditableList from '@/components/markdown/MarkdownEditableList'
import MarkdownHeadingView from '@/components/markdown/MarkdownHeadingView'
import MarkdownImageView from '@/components/markdown/MarkdownImageView'
import MarkdownInlineCodeView from '@/components/markdown/MarkdownInlineCodeView'
import MarkdownLinkView from '@/components/markdown/MarkdownLinkView'
import MarkdownListView from '@/components/markdown/MarkdownListView'
import MarkdownParagraphView from '@/components/markdown/MarkdownParagraphView'
import MarkdownTextMarkView from '@/components/markdown/MarkdownTextMarkView'

export const markdownBlockComponentRegistry = {
  blockquote: MarkdownBlockquoteView,
  code: MarkdownCodeBlockView,
  divider: MarkdownDividerView,
  editableList: MarkdownEditableList,
  heading: MarkdownHeadingView,
  image: MarkdownImageView,
  list: MarkdownListView,
  paragraph: MarkdownParagraphView,
} as const

export const markdownInlineComponentRegistry = {
  inlineCode: MarkdownInlineCodeView,
  link: MarkdownLinkView,
  textMark: MarkdownTextMarkView,
} as const
