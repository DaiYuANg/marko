import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

const SAVE_DEBOUNCE_MS = 600

type UseEditorBufferArgs = {
  activePath: string | null
  workspaceKey: string
}

export function useEditorBuffer({ activePath, workspaceKey }: UseEditorBufferArgs) {
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
  }, [workspaceKey])

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
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      const content = bufferRef.current[activePath] ?? editorRef.current
      setFileContents((prev) => {
        if (prev[activePath] === content) return prev
        return { ...prev, [activePath]: content }
      })
      void invoke('fs_write_file', { path: activePath, content })
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [activePath])

  return {
    fileContents,
    setFileContents,
    editorValue,
    onEditorChange,
  }
}
