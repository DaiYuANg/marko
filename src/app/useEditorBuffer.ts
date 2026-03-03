import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

const BUFFER_SYNC_DEBOUNCE_MS = 140

type UseEditorBufferArgs = {
  activePath: string | null
  workspaceKey: string
}

export function useEditorBuffer({ activePath, workspaceKey }: UseEditorBufferArgs) {
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [editorValue, setEditorValue] = useState('')
  const fileContentsRef = useRef<Record<string, string>>({})
  const activePathRef = useRef<string | null>(activePath)
  const syncTimers = useRef<Record<string, number>>({})
  const loadToken = useRef(0)

  useEffect(() => {
    fileContentsRef.current = fileContents
  }, [fileContents])

  useEffect(() => {
    activePathRef.current = activePath
  }, [activePath])

  useEffect(() => {
    if (!isTauri()) return
    Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
    syncTimers.current = {}
    setEditorValue('')
    setFileContents({})
    fileContentsRef.current = {}
    loadToken.current += 1
    void invoke('fs_flush_buffers').catch((error) => {
      console.error('flush buffers on workspace switch failed', error)
    })
  }, [workspaceKey])

  useEffect(() => {
    if (!activePath) {
      setEditorValue('')
      return
    }
    const cached = fileContentsRef.current[activePath]
    setEditorValue(cached ?? '')
    if (!isTauri()) {
      return
    }

    const token = loadToken.current + 1
    loadToken.current = token
    void invoke<string>('fs_open_file', { path: activePath })
      .then((content) => {
        if (loadToken.current !== token) return
        setFileContents((prev) => {
          if (prev[activePath] === content) return prev
          return { ...prev, [activePath]: content }
        })
        if (activePathRef.current === activePath) {
          setEditorValue(content)
        }
      })
      .catch((error) => {
        console.error('open file failed', error)
      })
  }, [activePath])

  useEffect(() => {
    return () => {
      Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
      syncTimers.current = {}
      if (isTauri()) {
        void invoke('fs_flush_buffers').catch((error) => {
          console.error('flush buffers on unmount failed', error)
        })
      }
    }
  }, [])

  const onEditorChange = useCallback((value: string) => {
    const path = activePathRef.current
    if (!path) return

    setEditorValue(value)
    setFileContents((prev) => ({ ...prev, [path]: value }))

    if (!isTauri()) return
    const currentTimer = syncTimers.current[path]
    if (currentTimer) {
      window.clearTimeout(currentTimer)
    }
    syncTimers.current[path] = window.setTimeout(() => {
      const latestValue = fileContentsRef.current[path] ?? value
      void invoke('fs_update_buffer', { path, content: latestValue }).catch((error) => {
        console.error('update buffer failed', error)
      })
      delete syncTimers.current[path]
    }, BUFFER_SYNC_DEBOUNCE_MS)
  }, [])

  return {
    fileContents,
    setFileContents,
    editorValue,
    onEditorChange,
  }
}
