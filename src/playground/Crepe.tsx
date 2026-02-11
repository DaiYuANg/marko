import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { Slice } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'
import { getMarkdown } from '@milkdown/kit/utils'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import { useAtomValue, useSetAtom } from 'jotai'
import throttle from 'lodash.throttle'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useToast } from '@/hooks/useToast'
import { encode } from '@/utils/share'
import { crepeAPI, markdown } from '@/playground/atom'

type MilkdownProps = {
  onChange: (markdown: string) => void
}

export default function CrepeEditor({ onChange }: MilkdownProps) {
  const crepeRef = useRef<Crepe | null>(null)
  const readyRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const darkMode = useDarkMode()
  const divRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const toastRef = useRef(toast)
  const contentRef = useRef('')
  const content = useAtomValue(markdown)
  const setCrepeAPI = useSetAtom(crepeAPI)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useLayoutEffect(() => {
    if (!divRef.current) return

    let destroyed = false
    const crepe = new Crepe({
      root: divRef.current,
      defaultValue: contentRef.current,
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          theme: darkMode ? undefined : eclipse,
        },
        [Crepe.Feature.LinkTooltip]: {
          onCopyLink: () => {
            toastRef.current('Link copied', 'success')
          },
        },
      },
    })

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated(
          throttle((_: unknown, markdown: string) => {
            onChangeRef.current(markdown)
          }, 200),
        )
      })
      .use(listener)

    crepe.create().then(() => {
      if (destroyed) return
      crepeRef.current = crepe
      readyRef.current = true
      setCrepeAPI({
        loaded: true,
        onShare: () => {
          if (!readyRef.current) return
          const content = crepe.editor.action(getMarkdown())
          const base64 = encode(content)
          const url = new URL(location.href)
          url.searchParams.set('text', base64)
          navigator.clipboard.writeText(url.toString()).then(() => {
            toastRef.current('Share link copied.', 'success')
          })
          window.history.pushState({}, '', url.toString())
        },
        update: (markdown: string) => {
          if (!readyRef.current) return
          const crepe = crepeRef.current
          if (!crepe) return
          if (crepe.getMarkdown() === markdown) return
          crepe.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx)
            const parser = ctx.get(parserCtx)
            const doc = parser(markdown)
            if (!doc) return
            const state = view.state
            const selection = state.selection
            const { from } = selection
            let tr = state.tr
            tr = tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))
            const docSize = doc.content.size
            const safeFrom = Math.min(from, docSize - 2)
            tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)))
            view.dispatch(tr)
          })
        },
      })
    })

    return () => {
      destroyed = true
      readyRef.current = false
      crepeRef.current = null
      crepe.destroy()
      setCrepeAPI({
        loaded: false,
        onShare: () => {},
        update: () => {},
      })
    }
  }, [darkMode, setCrepeAPI])

  return (
    <div className="crepe flex h-full flex-1 flex-col">
      <ScrollArea className="h-full flex-1">
        <div className="milkdown min-h-full" ref={divRef} />
      </ScrollArea>
    </div>
  )
}
