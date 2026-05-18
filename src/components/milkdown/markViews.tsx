import { memo } from 'react'
import {
  emphasisSchema,
  inlineCodeSchema,
  linkSchema,
  strongSchema,
} from '@milkdown/kit/preset/commonmark'
import { strikethroughSchema } from '@milkdown/kit/preset/gfm'
import type { Mark as ProseMirrorMark } from '@milkdown/kit/prose/model'
import type { MarkViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useMarkViewContext, type ReactMarkViewUserOptions } from '@prosemirror-adapter/react'
import MarkdownInlineCodeView from '@/components/markdown/MarkdownInlineCodeView'
import MarkdownLinkView from '@/components/markdown/MarkdownLinkView'
import MarkdownTextMarkView from '@/components/markdown/MarkdownTextMarkView'

type MarkViewFactory = (options: ReactMarkViewUserOptions) => MarkViewConstructor

const createContentElement = (
  tagName: 'a' | 'code' | 'del' | 'em' | 'strong',
  className: string,
) => {
  return (mark: ProseMirrorMark) => {
    const element = document.createElement(tagName)
    element.className = className
    if (tagName === 'a') {
      const href = mark.attrs.href
      if (typeof href === 'string') {
        element.setAttribute('href', href)
      }
      const title = mark.attrs.title
      if (typeof title === 'string') {
        element.setAttribute('title', title)
      }
    }
    return element
  }
}

const MilkdownInlineCodeMarkView = memo(function MilkdownInlineCodeMarkView() {
  const { contentRef } = useMarkViewContext()
  return <MarkdownInlineCodeView contentRef={contentRef} />
})

const MilkdownLinkMarkView = memo(function MilkdownLinkMarkView() {
  const { contentRef } = useMarkViewContext()
  return <MarkdownLinkView contentRef={contentRef} />
})

const MilkdownStrongMarkView = memo(function MilkdownStrongMarkView() {
  const { contentRef } = useMarkViewContext()
  return <MarkdownTextMarkView variant="strong" contentRef={contentRef} />
})

const MilkdownEmphasisMarkView = memo(function MilkdownEmphasisMarkView() {
  const { contentRef } = useMarkViewContext()
  return <MarkdownTextMarkView variant="emphasis" contentRef={contentRef} />
})

const MilkdownStrikethroughMarkView = memo(function MilkdownStrikethroughMarkView() {
  const { contentRef } = useMarkViewContext()
  return <MarkdownTextMarkView variant="strikethrough" contentRef={contentRef} />
})

export const createMarkdownMarkViews = (markViewFactory: MarkViewFactory) => [
  $view(strongSchema.mark, () =>
    markViewFactory({
      component: MilkdownStrongMarkView,
      as: 'span',
      contentAs: createContentElement('strong', ''),
    }),
  ),
  $view(emphasisSchema.mark, () =>
    markViewFactory({
      component: MilkdownEmphasisMarkView,
      as: 'span',
      contentAs: createContentElement('em', ''),
    }),
  ),
  $view(strikethroughSchema.mark, () =>
    markViewFactory({
      component: MilkdownStrikethroughMarkView,
      as: 'span',
      contentAs: createContentElement('del', ''),
    }),
  ),
  $view(inlineCodeSchema.mark, () =>
    markViewFactory({
      component: MilkdownInlineCodeMarkView,
      as: 'span',
      contentAs: createContentElement('code', 'font-mono'),
    }),
  ),
  $view(linkSchema.mark, () =>
    markViewFactory({
      component: MilkdownLinkMarkView,
      as: 'span',
      contentAs: createContentElement('a', ''),
    }),
  ),
]
