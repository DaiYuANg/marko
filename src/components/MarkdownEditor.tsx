import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { Crepe } from '@milkdown/crepe'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { Slice, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDarkMode } from '@/hooks/useDarkMode'
import { FOCUS_HEADING_EVENT, type FocusHeadingRequest } from '@/utils/editorNavigation'
import { slugify } from '@/logic/paths'

type MarkdownEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
}

export type MarkdownEditorHandle = {
  getMarkdown: () => string
}

const THROTTLE_MS = 200
const MERMAID_ALIASES = new Set(['mermaid', 'mmd'])
let mermaidRenderSequence = 0
let mermaidLoader: Promise<(typeof import('mermaid'))['default']> | null = null

const mermaidSupport = new LanguageSupport(
  StreamLanguage.define({
    token: (stream) => {
      stream.skipToEnd()
      return null
    },
  }),
)

const mermaidLanguage = LanguageDescription.of({
  name: 'Mermaid',
  alias: ['mermaid', 'mmd'],
  extensions: ['mmd', 'mermaid'],
  support: mermaidSupport,
})

const hasMermaidLanguage = (language: LanguageDescription) => {
  if (language.name.toLowerCase() === 'mermaid') return true
  return language.alias.some((alias) => MERMAID_ALIASES.has(alias.toLowerCase()))
}

const ensureMermaidLanguage = (languages: LanguageDescription[]) => {
  if (languages.some(hasMermaidLanguage)) return languages
  return [...languages, mermaidLanguage]
}

const isMermaidLanguage = (language: string) => {
  return MERMAID_ALIASES.has(language.trim().toLowerCase())
}

const loadMermaid = () => {
  mermaidLoader ??= import('mermaid').then((module) => module.default)
  return mermaidLoader
}

const resolveMermaidTheme = () => {
  const theme = document.documentElement.dataset.theme?.toLowerCase() ?? ''
  if (theme.includes('dark')) return 'dark'
  if (theme.includes('light')) return 'default'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

const escapeHtml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const createThrottledEmitter = (onChange: (value: string) => void) => {
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

const findHeadingPosition = (doc: ProseMirrorNode, targetSlug: string) => {
  const usedSlugs = new Map<string, number>()
  let headingIndex = 0
  let foundPosition: number | null = null

  doc.descendants((node, pos) => {
    if (foundPosition !== null) return false
    if (node.type.name !== 'heading') return true

    const text = node.textContent.trim()
    const baseSlug = slugify(text) || `heading-${headingIndex + 1}`
    const usedCount = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, usedCount + 1)
    const slug = usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount}`
    headingIndex += 1

    if (slug === targetSlug) {
      foundPosition = pos
      return false
    }

    return true
  })

  return foundPosition
}

const readCrepeMarkdown = (crepe: Crepe | null, fallback: string) => {
  if (!crepe) return fallback
  try {
    return crepe.getMarkdown() ?? fallback
  } catch {
    return fallback
  }
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ activePath, value, onChange }, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const crepeRef = useRef<Crepe | null>(null)
    const latestValue = useRef(value)
    const emitChangeRef = useRef(createThrottledEmitter(onChange))
    const darkMode = useDarkMode()

    useImperativeHandle(ref, () => ({
      getMarkdown: () => readCrepeMarkdown(crepeRef.current, latestValue.current),
    }))

    useEffect(() => {
      latestValue.current = value
    }, [value])

    useEffect(() => {
      emitChangeRef.current = createThrottledEmitter(onChange)
    }, [onChange])

    useEffect(() => {
      const handler = (event: Event) => {
        const { path, slug } = (event as CustomEvent<FocusHeadingRequest>).detail ?? {}
        if (!path || !slug || path !== activePath) return

        const crepe = crepeRef.current
        if (!crepe) return

        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          const position = findHeadingPosition(view.state.doc, slug)
          if (position === null) return

          const selectionPosition = Math.min(position + 1, view.state.doc.content.size)
          const tr = view.state.tr
            .setSelection(Selection.near(view.state.doc.resolve(selectionPosition)))
            .scrollIntoView()
          view.dispatch(tr)
          view.focus()
        })
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
        featureConfigs: {
          [Crepe.Feature.CodeMirror]: {
            theme: darkMode ? undefined : eclipse,
          },
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

          ctx.update(codeBlockConfig.key, (prev) => ({
            ...prev,
            languages: ensureMermaidLanguage(prev.languages),
            renderPreview: (language, content, applyPreview) => {
              if (!isMermaidLanguage(language)) {
                return prev.renderPreview(language, content, applyPreview)
              }

              const source = content.trim()
              if (!source) return null

              const currentRender = ++mermaidRenderSequence
              void loadMermaid()
                .then((mermaid) => {
                  mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: 'strict',
                    theme: resolveMermaidTheme(),
                  })
                  return mermaid.render(`marko-mermaid-${currentRender}`, source)
                })
                .then((result) => {
                  if (currentRender !== mermaidRenderSequence) return
                  const preview = document.createElement('div')
                  preview.className = 'milkdown-mermaid-preview'
                  preview.innerHTML = result.svg
                  applyPreview(preview)
                })
                .catch((error) => {
                  if (currentRender !== mermaidRenderSequence) return
                  const message = escapeHtml(getErrorMessage(error))
                  applyPreview(`<pre class="milkdown-mermaid-error">${message}</pre>`)
                })
            },
          }))
        })
        .use(listener)

      let destroyed = false
      void crepe
        .create()
        .then(() => {
          if (destroyed) return
          crepeRef.current = crepe
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
    }, [darkMode])

    useEffect(() => {
      const crepe = crepeRef.current
      if (!crepe) return
      if (readCrepeMarkdown(crepe, latestValue.current) === value) return

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
        <ScrollArea className="h-full flex-1">
          <div className="milkdown min-h-full" ref={rootRef} />
        </ScrollArea>
      </div>
    )
  },
)

export default MarkdownEditor
