import { memo } from 'react'
import { paragraphSchema } from '@milkdown/kit/preset/commonmark'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext, type ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import MarkdownParagraphView from '@/components/markdown/MarkdownParagraphView'

const MilkdownParagraphNodeView = memo(function MilkdownParagraphNodeView() {
  const { contentRef, selected } = useNodeViewContext()
  return <MarkdownParagraphView contentRef={contentRef} selected={selected} />
})

export const createMarkdownParagraphNodeView = (
  nodeViewFactory: (options: ReactNodeViewUserOptions) => NodeViewConstructor,
) =>
  $view(paragraphSchema.node, () =>
    nodeViewFactory({
      component: MilkdownParagraphNodeView,
      as: 'div',
      contentAs: 'p',
    }),
  )
