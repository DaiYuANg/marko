import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent } from 'react'
import {
  configureMarkdownCrepe,
  type MarkViewFactory,
  type NodeViewFactory,
} from '@/components/milkdown/configureMarkdownCrepe'
import { createMarkdownCrepe } from '@/components/milkdown/createMarkdownCrepe'
import {
  containsActiveElement,
  isEditorChromeTarget,
  scrollEditorViewportToTop,
} from '@/components/milkdown/editorDom'
import {
  focusCrepeEditor,
  focusCrepeEditorAtEnd,
  insertImageIntoCrepe,
  placeCrepeSelectionAtClientPoint,
  readCrepeMarkdown,
  replaceCrepeMarkdown,
  type PendingExternalValue,
  type ReplaceMarkdownOptions,
} from '@/components/milkdown/editorActions'
import {
  importMarkdownImageSources,
  pickMarkdownImageSource,
  type MarkdownImageImportSource,
} from '@/components/milkdown/assetEvents'
import {
  resolveExternalMarkdownSync,
  resolvePendingMarkdownSync,
} from '@/components/milkdown/editorSync'
import { runMarkdownEditorShortcut } from '@/components/milkdown/editorShortcuts'
import { resolveMarkdownImageSource } from '@/components/milkdown/markdownImageSource'
import { useFocusHeadingEvent } from '@/components/milkdown/useFocusHeadingEvent'
import type { MarkdownEditorProps } from '@/components/milkdown/markdownEditorTypes'
import type { ShortcutActionId } from '@/logic/shortcuts'
import type { MarkdownAssetImportStrategy } from '@/store/useAppStore'

type UseMarkdownCrepeControllerOptions = MarkdownEditorProps & {
  darkMode: boolean
  markdownAssetImportStrategy: MarkdownAssetImportStrategy
  markViewFactory: MarkViewFactory
  nodeViewFactory: NodeViewFactory
}

export const useMarkdownCrepeController = ({
  activePath,
  darkMode,
  markdownAssetImportStrategy,
  markViewFactory,
  nodeViewFactory,
  onChange,
  placeholder,
  slashLabels,
  value,
}: UseMarkdownCrepeControllerOptions) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<ReturnType<typeof createMarkdownCrepe> | null>(null)
  const latestValue = useRef(value)
  const onChangeRef = useRef(onChange)
  const activePathRef = useRef(activePath)
  const markdownAssetImportStrategyRef = useRef(markdownAssetImportStrategy)
  const activePathListenersRef = useRef(new Set<() => void>())
  const localEchoRef = useRef<{ path: string | null; value: string } | null>(null)
  const applyingExternalValueRef = useRef(false)
  const isComposingRef = useRef(false)
  const hasInitializedEditorRef = useRef(false)
  const lastSyncedPathRef = useRef(activePath)
  const pendingExternalValueRef = useRef<PendingExternalValue | null>(null)

  const focusEditor = useCallback(() => {
    focusCrepeEditor(crepeRef.current)
  }, [])

  const getMarkdown = useCallback(() => {
    return readCrepeMarkdown(crepeRef.current, latestValue.current)
  }, [])

  const insertImage = useCallback((src: string, alt?: string) => {
    return insertImageIntoCrepe(crepeRef.current, src, alt)
  }, [])

  const placeSelectionAtClientPoint = useCallback((clientX: number, clientY: number) => {
    return placeCrepeSelectionAtClientPoint(crepeRef.current, clientX, clientY)
  }, [])

  const importImageSources = useCallback(
    async (sources: MarkdownImageImportSource[]) => {
      return importMarkdownImageSources(sources, {
        activePath: activePathRef.current,
        insertImage,
        markdown: readCrepeMarkdown(crepeRef.current, latestValue.current),
        strategy: markdownAssetImportStrategyRef.current,
      })
    },
    [insertImage],
  )

  const pickAndImportImage = useCallback(async () => {
    const source = await pickMarkdownImageSource()
    if (!source) return false
    return importImageSources([source])
  }, [importImageSources])

  const runShortcutAction = useCallback(
    (action: ShortcutActionId) => {
      return runMarkdownEditorShortcut(crepeRef.current, action, {
        onImageImport: pickAndImportImage,
      })
    },
    [pickAndImportImage],
  )

  const getImageDocumentPath = useCallback(() => {
    return activePathRef.current
  }, [])

  const subscribeImageDocumentPath = useCallback((listener: () => void) => {
    activePathListenersRef.current.add(listener)
    return () => {
      activePathListenersRef.current.delete(listener)
    }
  }, [])

  const resolveImageSrc = useCallback((documentPath: string | null, src: string) => {
    return resolveMarkdownImageSource(documentPath, src)
  }, [])

  const scrollEditorToTop = useCallback(() => {
    scrollEditorViewportToTop(scrollAreaRef.current)
  }, [])

  const applyExternalValue = useCallback(
    (
      crepe: NonNullable<typeof crepeRef.current>,
      nextValue: string,
      options?: ReplaceMarkdownOptions,
    ) => {
      replaceCrepeMarkdown(crepe, nextValue, applyingExternalValueRef, latestValue, options)
    },
    [],
  )

  const hasEditorFocus = useCallback(() => {
    return containsActiveElement(rootRef.current)
  }, [])

  const applyPendingExternalValue = useCallback(() => {
    const crepe = crepeRef.current
    if (!crepe) return

    const decision = resolvePendingMarkdownSync({
      activePath: activePathRef.current,
      currentMarkdown: readCrepeMarkdown(crepe, latestValue.current),
      pending: pendingExternalValueRef.current,
    })

    if (decision.type === 'idle') return

    if (decision.clearPending) {
      pendingExternalValueRef.current = null
    }

    if (decision.type === 'accept') {
      latestValue.current = decision.latestValue
      lastSyncedPathRef.current = decision.lastSyncedPath
      return
    }

    if (decision.type === 'discard') return

    applyExternalValue(crepe, decision.value)
    lastSyncedPathRef.current = decision.lastSyncedPath
  }, [applyExternalValue])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    markdownAssetImportStrategyRef.current = markdownAssetImportStrategy
  }, [markdownAssetImportStrategy])

  useEffect(() => {
    activePathRef.current = activePath
    activePathListenersRef.current.forEach((listener) => listener())
  }, [activePath])

  useFocusHeadingEvent(activePath, crepeRef)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const crepe = createMarkdownCrepe({
      root,
      initialValue: latestValue.current,
      darkMode,
      onSlashImageImport: pickAndImportImage,
      placeholder,
      slashLabels,
    })

    configureMarkdownCrepe(crepe, {
      getImageDocumentPath,
      markViewFactory,
      nodeViewFactory,
      onMarkdownUpdated: (markdown) => {
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
      },
      resolveImageSrc,
      subscribeImageDocumentPath,
    })

    let destroyed = false
    void crepe
      .create()
      .then(() => {
        if (destroyed) return
        crepeRef.current = crepe
        if (readCrepeMarkdown(crepe, latestValue.current) !== latestValue.current) {
          applyExternalValue(crepe, latestValue.current, { preserveSelection: false })
        }
        lastSyncedPathRef.current = activePathRef.current
        if (!hasInitializedEditorRef.current) {
          hasInitializedEditorRef.current = true
          if (activePathRef.current) {
            scrollEditorToTop()
            focusEditor()
          }
        }
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
  }, [
    applyExternalValue,
    darkMode,
    focusEditor,
    getImageDocumentPath,
    markViewFactory,
    nodeViewFactory,
    pickAndImportImage,
    placeholder,
    resolveImageSrc,
    scrollEditorToTop,
    slashLabels,
    subscribeImageDocumentPath,
  ])

  useEffect(() => {
    const crepe = crepeRef.current
    if (!crepe) {
      const decision = resolveExternalMarkdownSync({
        activePath,
        currentMarkdown: latestValue.current,
        editorReady: false,
        hasEditorFocus: false,
        isComposing: isComposingRef.current,
        lastSyncedPath: lastSyncedPathRef.current,
        localEcho: localEchoRef.current,
        value,
      })

      if (decision.type === 'cache-unready') {
        latestValue.current = decision.latestValue
        lastSyncedPathRef.current = decision.lastSyncedPath
      }
      return
    }

    const decision = resolveExternalMarkdownSync({
      activePath,
      currentMarkdown: readCrepeMarkdown(crepe, latestValue.current),
      editorReady: true,
      hasEditorFocus: hasEditorFocus(),
      isComposing: isComposingRef.current,
      lastSyncedPath: lastSyncedPathRef.current,
      localEcho: localEchoRef.current,
      value,
    })

    if (decision.type === 'accept') {
      latestValue.current = decision.latestValue
      if (decision.clearLocalEcho) {
        localEchoRef.current = null
      }
      lastSyncedPathRef.current = decision.lastSyncedPath
      return
    }

    if (decision.type === 'defer') {
      pendingExternalValueRef.current = decision.pending
      return
    }

    if (decision.type === 'replace') {
      if (decision.clearLocalEcho) {
        localEchoRef.current = null
      }
      if (decision.clearPending) {
        pendingExternalValueRef.current = null
      }
      applyExternalValue(crepe, decision.value, decision.replaceOptions)
      lastSyncedPathRef.current = decision.lastSyncedPath
      if (decision.scrollToTop) {
        scrollEditorToTop()
      }
      if (decision.focus) {
        focusEditor()
      }
    }
  }, [activePath, applyExternalValue, focusEditor, hasEditorFocus, scrollEditorToTop, value])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
    applyPendingExternalValue()
  }, [applyPendingExternalValue])

  const handleBlur = useCallback(() => {
    applyPendingExternalValue()
  }, [applyPendingExternalValue])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (isEditorChromeTarget(target)) return
    focusCrepeEditorAtEnd(crepeRef.current)
  }, [])

  return {
    getMarkdown,
    handlers: {
      onBlur: handleBlur,
      onCompositionEnd: handleCompositionEnd,
      onCompositionStart: handleCompositionStart,
      onPointerDown: handlePointerDown,
    },
    focusEditor,
    insertImage,
    importImageSources,
    placeSelectionAtClientPoint,
    rootRef,
    runShortcutAction,
    scrollAreaRef,
  }
}
