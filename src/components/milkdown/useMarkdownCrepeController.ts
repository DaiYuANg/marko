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
  readCrepeMarkdown,
  replaceCrepeMarkdown,
  type PendingExternalValue,
  type ReplaceMarkdownOptions,
} from '@/components/milkdown/editorActions'
import {
  resolveExternalMarkdownSync,
  resolvePendingMarkdownSync,
} from '@/components/milkdown/editorSync'
import { runMarkdownEditorShortcut } from '@/components/milkdown/editorShortcuts'
import { useFocusHeadingEvent } from '@/components/milkdown/useFocusHeadingEvent'
import type { MarkdownEditorProps } from '@/components/milkdown/markdownEditorTypes'
import type { ShortcutActionId } from '@/logic/shortcuts'

type UseMarkdownCrepeControllerOptions = MarkdownEditorProps & {
  darkMode: boolean
  markViewFactory: MarkViewFactory
  nodeViewFactory: NodeViewFactory
}

export const useMarkdownCrepeController = ({
  activePath,
  darkMode,
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

  const runShortcutAction = useCallback((action: ShortcutActionId) => {
    return runMarkdownEditorShortcut(crepeRef.current, action)
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
    activePathRef.current = activePath
  }, [activePath])

  useFocusHeadingEvent(activePath, crepeRef)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const crepe = createMarkdownCrepe({
      root,
      initialValue: latestValue.current,
      darkMode,
      placeholder,
      slashLabels,
    })

    configureMarkdownCrepe(crepe, {
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
    markViewFactory,
    nodeViewFactory,
    placeholder,
    scrollEditorToTop,
    slashLabels,
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
    rootRef,
    runShortcutAction,
    scrollAreaRef,
  }
}
