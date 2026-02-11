import { useEffect, useLayoutEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { Slice } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
}

const THROTTLE_MS = 200

function createThrottledEmitter(onChange: (value: string) => void) {
  let lastCall = 0
  let timer: number | null = null
  let pending: string | null = null

  return (value: string) => {
    const now = Date.now()
    const remaining = THROTTLE_MS - (now - lastCall)
    if (remaining <= 0) {
      lastCall = now
      onChange(value)
      return
    }

    pending = value
    if (timer) return
    timer = window.setTimeout(() => {
      timer = null
      if (pending !== null) {
        lastCall = Date.now()
        onChange(pending)
        pending = null
      }
    }, remaining)
  }
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const initialValue = useRef(value)
  const latestValue = useRef(value)
  const emitChangeRef = useRef(createThrottledEmitter(onChange))

  useEffect(() => {
    latestValue.current = value
  }, [value])

  useEffect(() => {
    emitChangeRef.current = createThrottledEmitter(onChange)
  }, [onChange])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const crepe = new Crepe({
      root,
      defaultValue: initialValue.current,
      featureConfigs: {
        [Crepe.Feature.LinkTooltip]: {
          onCopyLink: () => {},
        },
      },
    })

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          if (markdown === latestValue.current) return
          emitChangeRef.current(markdown)
        })
      })
      .use(listener)

    let destroyed = false
    crepe.create().then(() => {
      if (destroyed) return
      crepeRef.current = crepe
    })

    return () => {
      destroyed = true
      crepe.destroy()
      crepeRef.current = null
    }
  }, [])

  useEffect(() => {
    const crepe = crepeRef.current
    if (!crepe) return
    if (crepe.getMarkdown() === value) return

    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const parser = ctx.get(parserCtx)
      const doc = parser(value)
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
  }, [value])

  return (
    <div className="crepe flex h-full flex-1 flex-col">
      <div className="milkdown flex-1" ref={rootRef} />
    </div>
  )
}
