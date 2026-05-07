import { useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor, IPosition, languages as MonacoLanguages } from 'monaco-editor'
import { useDarkMode } from '@/hooks/useDarkMode'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import type { FileEntry } from '@/store/useAppStore'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import {
  FOCUS_SOURCE_POSITION_EVENT,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'

type MarkdownSourceEditorProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
  onChange: (value: string) => void
}

export default function MarkdownSourceEditor({
  activePath,
  value,
  files,
  fileContents,
  workspaceIndex,
  onChange,
}: MarkdownSourceEditorProps) {
  const darkMode = useDarkMode()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const completionContextRef = useRef({ activePath, files, fileContents, workspaceIndex })

  useEffect(() => {
    completionContextRef.current = { activePath, files, fileContents, workspaceIndex }
  }, [activePath, fileContents, files, workspaceIndex])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    completionDisposableRef.current?.dispose()
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['[', '(', '#', '/', '`'],
      provideCompletionItems: (model: MonacoEditor.ITextModel, position: IPosition) => {
        const context = completionContextRef.current
        const suggestions: MonacoLanguages.CompletionItem[] = getMarkdownCompletions({
          ...context,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
        }).map((item) => ({
          label: item.label,
          kind:
            item.kind === 'file'
              ? monaco.languages.CompletionItemKind.File
              : item.kind === 'heading'
                ? monaco.languages.CompletionItemKind.Reference
                : monaco.languages.CompletionItemKind.Keyword,
          insertText: item.insertText,
          detail: item.detail,
          range: new monaco.Range(
            position.lineNumber,
            item.replacementStartColumn,
            position.lineNumber,
            position.column,
          ),
        }))
        return { suggestions }
      },
    })
  }

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose()
      completionDisposableRef.current = null
    }
  }, [])

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
