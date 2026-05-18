import { headingSchema } from '@milkdown/kit/preset/commonmark'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext, type ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { markdownBlockComponentRegistry } from '@/components/markdown/markdownComponentRegistry'

const readHeadingLevel = (level: unknown) => {
  return typeof level === 'number' ? level : 1
}

const HeadingView = markdownBlockComponentRegistry.heading

const MilkdownHeadingNodeView = () => {
  const { contentRef, node, selected } = useNodeViewContext()
  return (
    <HeadingView
      level={readHeadingLevel(node.attrs.level)}
      contentRef={contentRef}
      selected={selected}
    />
  )
}

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
