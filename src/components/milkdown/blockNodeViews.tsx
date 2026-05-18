import { memo } from 'react'
import {
  blockquoteSchema,
  bulletListSchema,
  hrSchema,
  orderedListSchema,
} from '@milkdown/kit/preset/commonmark'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext, type ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import MarkdownBlockquoteView from '@/components/markdown/MarkdownBlockquoteView'
import MarkdownDividerView from '@/components/markdown/MarkdownDividerView'
import MarkdownListView from '@/components/markdown/MarkdownListView'

type NodeViewFactory = (options: ReactNodeViewUserOptions) => NodeViewConstructor

const createContentElement = (tagName: 'blockquote' | 'ol' | 'ul', className: string) => {
  const element = document.createElement(tagName)
  element.className = className
  return element
}

const MilkdownBlockquoteNodeView = memo(() => {
  const { contentRef, selected } = useNodeViewContext()
  return <MarkdownBlockquoteView contentRef={contentRef} selected={selected} />
})

const MilkdownBulletListNodeView = memo(() => {
  const { contentRef, selected } = useNodeViewContext()
  return <MarkdownListView contentRef={contentRef} selected={selected} />
})

const MilkdownOrderedListNodeView = memo(() => {
  const { contentRef, selected } = useNodeViewContext()
  return <MarkdownListView contentRef={contentRef} selected={selected} ordered />
})

const MilkdownDividerNodeView = memo(() => {
  const { selected } = useNodeViewContext()
  return <MarkdownDividerView selected={selected} />
})

export const createMarkdownBlockNodeViews = (nodeViewFactory: NodeViewFactory) => [
  $view(blockquoteSchema.node, () =>
    nodeViewFactory({
      component: MilkdownBlockquoteNodeView,
      as: 'div',
      contentAs: () =>
        createContentElement(
          'blockquote',
          'm-0 border-0 p-0 text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        ),
    }),
  ),
  $view(bulletListSchema.node, () =>
    nodeViewFactory({
      component: MilkdownBulletListNodeView,
      as: 'div',
      contentAs: () => createContentElement('ul', 'm-0 list-disc space-y-1 pl-5'),
    }),
  ),
  $view(orderedListSchema.node, () =>
    nodeViewFactory({
      component: MilkdownOrderedListNodeView,
      as: 'div',
      contentAs: () => createContentElement('ol', 'm-0 list-decimal space-y-1 pl-5'),
    }),
  ),
  $view(hrSchema.node, () =>
    nodeViewFactory({
      component: MilkdownDividerNodeView,
      as: 'div',
    }),
  ),
]
