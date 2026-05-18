import { memo } from 'react'
import { headingSchema } from '@milkdown/kit/preset/commonmark'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext, type ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import MarkdownHeadingView from '@/components/markdown/MarkdownHeadingView'

const readHeadingLevel = (level: unknown) => {
  return typeof level === 'number' ? level : 1
}

const MilkdownHeadingNodeView = memo(function MilkdownHeadingNodeView() {
  const { contentRef, node, selected } = useNodeViewContext()
  return (
    <MarkdownHeadingView
      level={readHeadingLevel(node.attrs.level)}
      contentRef={contentRef}
      selected={selected}
    />
  )
})

export const createMarkdownHeadingNodeView = (
  nodeViewFactory: (options: ReactNodeViewUserOptions) => NodeViewConstructor,
) =>
  $view(headingSchema.node, () =>
    nodeViewFactory({
      component: MilkdownHeadingNodeView,
      as: 'div',
      contentAs: 'span',
    }),
  )
