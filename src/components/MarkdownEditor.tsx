import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
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
import { resolveShortcutBindings } from '@/logic/shortcuts'
import { useAppStore } from '@/store/useAppStore'

const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const nodeViewFactory = useNodeViewFactory()
  const markViewFactory = useMarkViewFactory()
  const shortcutOverrides = useAppStore((state) => state.shortcutOverrides)
  const { focusEditor, getMarkdown, handlers, rootRef, runShortcutAction, scrollAreaRef } =
    useMarkdownCrepeController({
      ...props,
      darkMode,
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

  return (
    <div ref={shellRef} className="crepe flex h-full flex-1 flex-col" {...handlers}>
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
