import { useEffect, useState, useSyncExternalStore } from 'react'
import { imageSchema } from '@milkdown/kit/preset/commonmark'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext, type ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { markdownBlockComponentRegistry } from '@/components/markdown/markdownComponentRegistry'

type NodeViewFactory = (options: ReactNodeViewUserOptions) => NodeViewConstructor

type MarkdownImageNodeViewContext = {
  getDocumentPath: () => string | null
  resolveImageSrc: (documentPath: string | null, src: string) => Promise<string>
  subscribeDocumentPath: (listener: () => void) => () => void
}

const ImageView = markdownBlockComponentRegistry.image

const readAttr = (value: unknown) => (typeof value === 'string' ? value : '')

export const createMarkdownImageNodeView = (
  nodeViewFactory: NodeViewFactory,
  { getDocumentPath, resolveImageSrc, subscribeDocumentPath }: MarkdownImageNodeViewContext,
) => {
  const MilkdownImageNodeView = () => {
    const { node, selected } = useNodeViewContext()
    const src = readAttr(node.attrs.src)
    const alt = readAttr(node.attrs.alt)
    const title = readAttr(node.attrs.title)
    const documentPath = useSyncExternalStore(
      subscribeDocumentPath,
      getDocumentPath,
      getDocumentPath,
    )
    const [displaySrc, setDisplaySrc] = useState(src)

    useEffect(() => {
      let cancelled = false
      if (!src) {
        setDisplaySrc(src)
        return
      }

      void resolveImageSrc(documentPath, src).then((resolvedSrc) => {
        if (!cancelled) {
          setDisplaySrc(resolvedSrc)
        }
      })

      return () => {
        cancelled = true
      }
    }, [documentPath, src])

    return <ImageView src={displaySrc} alt={alt} title={title} selected={selected} />
  }

  return $view(imageSchema.node, () =>
    nodeViewFactory({
      component: MilkdownImageNodeView,
      as: 'span',
    }),
  )
}
