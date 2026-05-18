import { forwardRef, useImperativeHandle } from 'react'
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

const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const nodeViewFactory = useNodeViewFactory()
  const markViewFactory = useMarkViewFactory()
  const { focusEditor, getMarkdown, handlers, rootRef, scrollAreaRef } = useMarkdownCrepeController(
    {
      ...props,
      darkMode,
      markViewFactory,
      nodeViewFactory,
    },
  )

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    getMarkdown,
  }))

  return (
    <div className="crepe flex h-full flex-1 flex-col" {...handlers}>
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
