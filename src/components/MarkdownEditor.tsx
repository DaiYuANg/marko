import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
} from 'react'
import { useHotkeys, type RegisterableHotkey } from '@tanstack/react-hotkeys'
import {
  ProsemirrorAdapterProvider,
  useMarkViewFactory,
  useNodeViewFactory,
} from '@prosemirror-adapter/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDarkMode } from '@/hooks/useDarkMode'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import { useMarkdownCrepeController } from '@/components/milkdown/useMarkdownCrepeController'
import { editorShortcutActionIds } from '@/components/milkdown/editorShortcuts'
import {
  hasImageDataTransfer,
  imageSourcesFromPasteEvent,
  imageSourcesFromDropEvent,
  imageSourcesFromTauriDropPaths,
  readNativeClipboardImageSource,
  type MarkdownImageImportSource,
} from '@/components/milkdown/assetEvents'
import { resolveShortcutBindings } from '@/logic/shortcuts'
import { useAppStore } from '@/store/useAppStore'

const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const nodeViewFactory = useNodeViewFactory()
  const markViewFactory = useMarkViewFactory()
  const shortcutOverrides = useAppStore((state) => state.shortcutOverrides)
  const markdownAssetImportStrategy = useAppStore((state) => state.markdownAssetImportStrategy)
  const {
    focusEditor,
    getMarkdown,
    handlers,
    importImageSources,
    placeSelectionAtClientPoint,
    rootRef,
    runShortcutAction,
    scrollAreaRef,
  } = useMarkdownCrepeController({
    ...props,
    darkMode,
    markdownAssetImportStrategy,
    markViewFactory,
    nodeViewFactory,
  })
  const shortcutDefinitions = useMemo(() => {
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return editorShortcutActionIds.flatMap((action) =>
      bindings[action].map((hotkey) => ({
        hotkey: hotkey as RegisterableHotkey,
        callback: () => {
          runShortcutAction(action)
        },
        options: {
          meta: { name: action },
        },
      })),
    )
  }, [runShortcutAction, shortcutOverrides])
  const importDroppedImageSources = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      placeSelectionAtClientPoint(event.clientX, event.clientY)
      await importImageSources(imageSourcesFromDropEvent(event))
    },
    [importImageSources, placeSelectionAtClientPoint],
  )
  const importNativeClipboardImage = useCallback(async () => {
    const source = await readNativeClipboardImageSource()
    if (!source) return false
    return importImageSources([source])
  }, [importImageSources])
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const sources = imageSourcesFromPasteEvent(event)
      if (sources.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        void importImageSources(sources)
        return
      }

      if (event.clipboardData.getData('text/plain').trim()) return
      event.preventDefault()
      event.stopPropagation()
      void importNativeClipboardImage()
    },
    [importImageSources, importNativeClipboardImage],
  )
  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const sources = imageSourcesFromDropEvent(event)
      if (sources.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      void importDroppedImageSources(event)
    },
    [importDroppedImageSources],
  )
  const handleDragOverCapture = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasImageDataTransfer(event.dataTransfer)) return
    event.preventDefault()
  }, [])

  useHotkeys(shortcutDefinitions, {
    conflictBehavior: 'replace',
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
    target: shellRef,
  })

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    getMarkdown,
  }))

  useTauriImageDrop({
    shellRef,
    importImageSources,
    placeSelectionAtClientPoint,
  })

  return (
    <div
      ref={shellRef}
      className="crepe flex h-full flex-1 flex-col"
      onDragOverCapture={handleDragOverCapture}
      onDropCapture={handleDropCapture}
      onPasteCapture={handlePasteCapture}
      {...handlers}
    >
      <ScrollArea
        ref={scrollAreaRef}
        className="h-full flex-1"
        viewportClassName="editor-scroll-viewport"
      >
        <div className="milkdown min-h-full" ref={rootRef} />
      </ScrollArea>
    </div>
  )
})

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  return (
    <ProsemirrorAdapterProvider>
      <MarkdownEditorInner {...props} ref={ref} />
    </ProsemirrorAdapterProvider>
  )
})

export default MarkdownEditor

const useTauriImageDrop = ({
  importImageSources,
  placeSelectionAtClientPoint,
  shellRef,
}: {
  importImageSources: (sources: MarkdownImageImportSource[]) => Promise<boolean>
  placeSelectionAtClientPoint: (clientX: number, clientY: number) => boolean
  shellRef: RefObject<HTMLDivElement | null>
}) => {
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    const setup = async () => {
      const [{ isTauri }, { getCurrentWebview }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/webview'),
      ])
      if (!isTauri() || disposed) return

      const nextUnlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return
        const rect = shellRef.current?.getBoundingClientRect()
        if (!rect) return

        const clientX = event.payload.position.x / window.devicePixelRatio
        const clientY = event.payload.position.y / window.devicePixelRatio
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        if (!inside) return

        const sources = imageSourcesFromTauriDropPaths(event.payload.paths)
        if (sources.length === 0) return

        placeSelectionAtClientPoint(clientX, clientY)
        void importImageSources(sources)
      })
      if (disposed) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    }

    void setup()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [importImageSources, placeSelectionAtClientPoint, shellRef])
}
