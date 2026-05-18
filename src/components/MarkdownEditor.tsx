import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type PointerEvent,
} from 'react'
import { Crepe } from '@milkdown/crepe'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import {
  ProsemirrorAdapterProvider,
  useMarkViewFactory,
  useNodeViewFactory,
} from '@prosemirror-adapter/react'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDarkMode } from '@/hooks/useDarkMode'
import { FOCUS_HEADING_EVENT, type FocusHeadingRequest } from '@/utils/editorNavigation'
import { createMarkdownBlockNodeViews } from '@/components/milkdown/blockNodeViews'
import {
  focusCrepeEditor,
  focusHeadingInCrepe,
  readCrepeMarkdown,
  replaceCrepeMarkdown,
  type PendingExternalValue,
} from '@/components/milkdown/editorActions'
import { createMarkdownHeadingNodeView } from '@/components/milkdown/headingNodeView'
import { createMarkdownMarkViews } from '@/components/milkdown/markViews'
import { configureMermaidPreview } from '@/components/milkdown/mermaidPreview'
import { createMarkdownParagraphNodeView } from '@/components/milkdown/paragraphNodeView'
import {
  createSlashMenuConfig,
  type SlashCommandLabels,
} from '@/components/milkdown/slashMenuConfig'

type MarkdownEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  placeholder: string
  slashLabels: SlashCommandLabels
}

export type MarkdownEditorHandle = {
  focus: () => void
  getMarkdown: () => string
}

const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  ({ activePath, value, onChange, placeholder, slashLabels }, ref) => {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const crepeRef = useRef<Crepe | null>(null)
    const latestValue = useRef(value)
    const onChangeRef = useRef(onChange)
    const activePathRef = useRef(activePath)
    const localEchoRef = useRef<{ path: string | null; value: string } | null>(null)
    const applyingExternalValueRef = useRef(false)
    const isComposingRef = useRef(false)
    const lastSyncedPathRef = useRef(activePath)
    const pendingExternalValueRef = useRef<PendingExternalValue | null>(null)
    const darkMode = useDarkMode()
    const nodeViewFactory = useNodeViewFactory()
    const markViewFactory = useMarkViewFactory()

    const focusEditor = () => {
      focusCrepeEditor(crepeRef.current)
    }

    useImperativeHandle(ref, () => ({
      focus: focusEditor,
      getMarkdown: () => readCrepeMarkdown(crepeRef.current, latestValue.current),
    }))

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    useEffect(() => {
      activePathRef.current = activePath
    }, [activePath])

    const applyExternalValue = (crepe: Crepe, nextValue: string) => {
      replaceCrepeMarkdown(crepe, nextValue, applyingExternalValueRef, latestValue)
    }

    const hasEditorFocus = () => {
      const root = rootRef.current
      return Boolean(root && document.activeElement && root.contains(document.activeElement))
    }

    const applyPendingExternalValue = () => {
      const pending = pendingExternalValueRef.current
      const crepe = crepeRef.current
      if (!pending || !crepe || pending.path !== activePathRef.current) return

      pendingExternalValueRef.current = null
      const currentMarkdown = readCrepeMarkdown(crepe, latestValue.current)
      if (currentMarkdown === pending.value) {
        latestValue.current = pending.value
        lastSyncedPathRef.current = pending.path
        return
      }

      if (currentMarkdown !== pending.baseValue) return

      applyExternalValue(crepe, pending.value)
      lastSyncedPathRef.current = pending.path
    }

    useEffect(() => {
      const handler = (event: Event) => {
        const { path, slug } = (event as CustomEvent<FocusHeadingRequest>).detail ?? {}
        if (!path || !slug || path !== activePath) return

        const crepe = crepeRef.current
        if (!crepe) return

        focusHeadingInCrepe(crepe, slug)
      }

      window.addEventListener(FOCUS_HEADING_EVENT, handler)
      return () => window.removeEventListener(FOCUS_HEADING_EVENT, handler)
    }, [activePath])

    useLayoutEffect(() => {
      const root = rootRef.current
      if (!root) return

      const crepe = new Crepe({
        root,
        defaultValue: latestValue.current,
        features: {
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.Placeholder]: true,
        },
        featureConfigs: {
          [Crepe.Feature.CodeMirror]: {
            theme: darkMode ? undefined : eclipse,
          },
          [Crepe.Feature.LinkTooltip]: {
            onCopyLink: () => {},
          },
          [Crepe.Feature.Placeholder]: {
            text: placeholder,
            mode: 'block',
          },
          [Crepe.Feature.BlockEdit]: createSlashMenuConfig(slashLabels),
        },
      })

      crepe.editor
        .config((ctx) => {
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            if (applyingExternalValueRef.current) {
              latestValue.current = markdown
              return
            }
            if (markdown === latestValue.current) return
            latestValue.current = markdown
            localEchoRef.current = {
              path: activePathRef.current,
              value: markdown,
            }
            onChangeRef.current(markdown)
          })

          ctx.update(codeBlockConfig.key, configureMermaidPreview)
        })
        .use(listener)
        .use(createMarkdownParagraphNodeView(nodeViewFactory))
        .use(createMarkdownHeadingNodeView(nodeViewFactory))
        .use(createMarkdownBlockNodeViews(nodeViewFactory))
        .use(createMarkdownMarkViews(markViewFactory))

      let destroyed = false
      void crepe
        .create()
        .then(() => {
          if (destroyed) return
          crepeRef.current = crepe
          if (readCrepeMarkdown(crepe, latestValue.current) !== latestValue.current) {
            applyExternalValue(crepe, latestValue.current)
          }
          lastSyncedPathRef.current = activePathRef.current
        })
        .catch((error) => {
          if (destroyed) return
          console.error('Failed to initialize Milkdown', error)
        })

      return () => {
        destroyed = true
        if (crepeRef.current === crepe) {
          latestValue.current = readCrepeMarkdown(crepe, latestValue.current)
          crepeRef.current = null
        }
        try {
          crepe.destroy()
        } catch {
          // Crepe can be half-initialized during React dev teardown.
        }
      }
    }, [darkMode, markViewFactory, nodeViewFactory, placeholder, slashLabels])

    useEffect(() => {
      const crepe = crepeRef.current
      if (!crepe) {
        latestValue.current = value
        lastSyncedPathRef.current = activePath
        return
      }
      const pathChanged = lastSyncedPathRef.current !== activePath
      const localEcho = localEchoRef.current
      if (localEcho?.path === activePath && localEcho.value === value) {
        latestValue.current = value
        localEchoRef.current = null
        lastSyncedPathRef.current = activePath
        return
      }
      if (readCrepeMarkdown(crepe, latestValue.current) === value) {
        latestValue.current = value
        lastSyncedPathRef.current = activePath
        return
      }

      if ((isComposingRef.current || hasEditorFocus()) && !pathChanged) {
        if (localEcho?.path === activePath && localEcho.value !== value) {
          return
        }
        pendingExternalValueRef.current = {
          path: activePath,
          value,
          baseValue: readCrepeMarkdown(crepe, latestValue.current),
        }
        return
      }

      pendingExternalValueRef.current = null
      applyExternalValue(crepe, value)
      lastSyncedPathRef.current = activePath
    }, [activePath, value])

    const handleCompositionStart = () => {
      isComposingRef.current = true
    }

    const handleCompositionEnd = () => {
      isComposingRef.current = false
      applyPendingExternalValue()
    }

    const handleBlur = () => {
      applyPendingExternalValue()
    }

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.ProseMirror')) return
      if (target.closest('.milkdown-toolbar, .milkdown-link-preview, .milkdown-link-edit')) return
      focusEditor()
    }

    return (
      <div
        className="crepe flex h-full flex-1 flex-col"
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBlur={handleBlur}
        onPointerDown={handlePointerDown}
      >
        <ScrollArea className="h-full flex-1">
          <div className="milkdown min-h-full" ref={rootRef} />
        </ScrollArea>
      </div>
    )
  },
)

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  return (
    <ProsemirrorAdapterProvider>
      <MarkdownEditorInner {...props} ref={ref} />
    </ProsemirrorAdapterProvider>
  )
})

export default MarkdownEditor
