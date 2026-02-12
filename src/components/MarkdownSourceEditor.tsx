import Editor from '@monaco-editor/react'
import { useDarkMode } from '@/hooks/useDarkMode'

type MarkdownSourceEditorProps = {
  value: string
  onChange: (value: string) => void
}

export default function MarkdownSourceEditor({ value, onChange }: MarkdownSourceEditorProps) {
  const darkMode = useDarkMode()

  return (
    <div className="h-full overflow-hidden rounded-md border border-border">
      <Editor
        height="100%"
        language="markdown"
        theme={darkMode ? 'vs-dark' : 'vs'}
        value={value}
        onChange={(next) => onChange(next ?? '')}
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
