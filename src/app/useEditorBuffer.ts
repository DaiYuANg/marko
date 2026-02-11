import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

const SAVE_DEBOUNCE_MS = 600

type UseEditorBufferArgs = {
  activePath: string | null
  filePathMap: Map<string, string>
  projectPath: string | null
}

export function useEditorBuffer({
  activePath,
  filePathMap,
  projectPath,
}: UseEditorBufferArgs) {
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [editorValue, setEditorValue] = useState('')
  const saveTimer = useRef<number | null>(null)
  const lastActiveRef = useRef<string | null>(null)
  const editorRef = useRef<string>('')
  const bufferRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!activePath) return
    const content = fileContents[activePath] ?? ''
    if (lastActiveRef.current !== activePath) {
      lastActiveRef.current = activePath
      editorRef.current = bufferRef.current[activePath] ?? content
      bufferRef.current[activePath] = editorRef.current
      setEditorValue(editorRef.current)
    }
  }, [activePath, fileContents])

  useEffect(() => {
    lastActiveRef.current = null
    bufferRef.current = {}
  }, [projectPath])

  const onEditorChange = useCallback(
    (value: string) => {
      if (!activePath) return
      editorRef.current = value
      bufferRef.current[activePath] = value
    },
    [activePath],
  )

  useEffect(() => {
    if (!activePath || !isTauri()) return
    const absolutePath = filePathMap.get(activePath)
    if (!absolutePath) return
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      const content = bufferRef.current[activePath] ?? editorRef.current
      setFileContents((prev) => {
        if (prev[activePath] === content) return prev
        return { ...prev, [activePath]: content }
      })
      void invoke('write_markdown_file', { path: absolutePath, content })
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [activePath, filePathMap])

  return {
    fileContents,
    setFileContents,
    editorValue,
    onEditorChange,
  }
}
