import type { Crepe } from '@milkdown/crepe'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import type { MarkViewConstructor, NodeViewConstructor } from '@milkdown/kit/prose/view'
import type { ReactMarkViewUserOptions, ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { createMarkdownBlockNodeViews } from '@/components/milkdown/blockNodeViews'
import { createMarkdownHeadingNodeView } from '@/components/milkdown/headingNodeView'
import { createMarkdownMarkViews } from '@/components/milkdown/markViews'
import { configureMermaidPreview } from '@/components/milkdown/mermaidPreview'
import { createMarkdownParagraphNodeView } from '@/components/milkdown/paragraphNodeView'
import { pasteLinkOnSelection } from '@/components/milkdown/pasteEnhancements'
import { markdownEditorShortcuts } from '@/components/milkdown/editorShortcuts'

export type NodeViewFactory = (options: ReactNodeViewUserOptions) => NodeViewConstructor
export type MarkViewFactory = (options: ReactMarkViewUserOptions) => MarkViewConstructor

type ConfigureMarkdownCrepeOptions = {
  markViewFactory: MarkViewFactory
  nodeViewFactory: NodeViewFactory
  onMarkdownUpdated: (markdown: string) => void
}

export const configureMarkdownCrepe = (
  crepe: Crepe,
  { markViewFactory, nodeViewFactory, onMarkdownUpdated }: ConfigureMarkdownCrepeOptions,
) => {
  crepe.editor
    .config((ctx) => {
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        onMarkdownUpdated(markdown)
      })

      ctx.update(codeBlockConfig.key, configureMermaidPreview)
    })
    .use(listener)
    .use(createMarkdownParagraphNodeView(nodeViewFactory))
    .use(createMarkdownHeadingNodeView(nodeViewFactory))
    .use(createMarkdownBlockNodeViews(nodeViewFactory))
    .use(createMarkdownMarkViews(markViewFactory))
    .use(markdownEditorShortcuts)
    .use(pasteLinkOnSelection)

  return crepe
}
