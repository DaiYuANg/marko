import type { Crepe } from '@milkdown/crepe'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import type { MarkViewConstructor, NodeViewConstructor } from '@milkdown/kit/prose/view'
import type { ReactMarkViewUserOptions, ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { createMarkdownBlockNodeViews } from '@/components/milkdown/blockNodeViews'
import { createMarkdownHeadingNodeView } from '@/components/milkdown/headingNodeView'
import { createMarkdownImageNodeView } from '@/components/milkdown/imageNodeView'
import { createMarkdownMarkViews } from '@/components/milkdown/markViews'
import { configureMermaidPreview } from '@/components/milkdown/mermaidPreview'
import { createMarkdownParagraphNodeView } from '@/components/milkdown/paragraphNodeView'
import { pasteLinkOnSelection } from '@/components/milkdown/pasteEnhancements'

export type NodeViewFactory = (options: ReactNodeViewUserOptions) => NodeViewConstructor
export type MarkViewFactory = (options: ReactMarkViewUserOptions) => MarkViewConstructor

type ConfigureMarkdownCrepeOptions = {
  getImageDocumentPath: () => string | null
  markViewFactory: MarkViewFactory
  nodeViewFactory: NodeViewFactory
  onMarkdownUpdated: (markdown: string) => void
  resolveImageSrc: (documentPath: string | null, src: string) => Promise<string>
  subscribeImageDocumentPath: (listener: () => void) => () => void
}

export const configureMarkdownCrepe = (
  crepe: Crepe,
  {
    getImageDocumentPath,
    markViewFactory,
    nodeViewFactory,
    onMarkdownUpdated,
    resolveImageSrc,
    subscribeImageDocumentPath,
  }: ConfigureMarkdownCrepeOptions,
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
    .use(
      createMarkdownImageNodeView(nodeViewFactory, {
        getDocumentPath: getImageDocumentPath,
        resolveImageSrc,
        subscribeDocumentPath: subscribeImageDocumentPath,
      }),
    )
    .use(createMarkdownBlockNodeViews(nodeViewFactory))
    .use(createMarkdownMarkViews(markViewFactory))
    .use(pasteLinkOnSelection)

  return crepe
}
