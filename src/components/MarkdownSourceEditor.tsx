import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useDarkMode } from '@/hooks/useDarkMode'
import {
  FOCUS_SOURCE_POSITION_EVENT,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'

type MarkdownSourceEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
}

export default function MarkdownSourceEditor({
  activePath,
  value,
  onChange,
}: MarkdownSourceEditorProps) {
  const darkMode = useDarkMode()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const { path, line, column } = (event as CustomEvent<FocusSourcePositionRequest>).detail ?? {}
      if (!path || path !== activePath) return
      if (!Number.isFinite(line) || !Number.isFinite(column)) return

      const editor = editorRef.current
      if (!editor) return

      const lineNumber = Math.max(1, line)
      const columnNumber = Math.max(1, column)
      editor.setPosition({ lineNumber, column: columnNumber })
      editor.revealLineInCenter(lineNumber)
      editor.focus()
    }

    window.addEventListener(FOCUS_SOURCE_POSITION_EVENT, handler)
    return () => window.removeEventListener(FOCUS_SOURCE_POSITION_EVENT, handler)
  }, [activePath])

  return (
    <div className="h-full overflow-hidden rounded-md border border-border">
      <Editor
        height="100%"
        language="markdown"
        theme={darkMode ? 'vs-dark' : 'vs'}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          tabSize: 2,
          scrollBeyondLastLine: false,
          fontSize: 14,
          lineNumbers: 'on',
          smoothScrolling: true,
          renderWhitespace: 'selection',
          automaticLayout: true,
        }}
      />
    </div>
  )
}
