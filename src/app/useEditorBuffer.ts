import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

const BUFFER_SYNC_DEBOUNCE_MS = 140
const EMPTY_FILE_CONTENTS: Record<string, string> = {}
const EMPTY_DIRTY_PATHS: Record<string, true> = {}

type UseEditorBufferArgs = {
  activePath: string | null
  workspaceKey: string
}

type WorkspaceContents = Record<string, Record<string, string>>
type WorkspaceDirtyPaths = Record<string, Record<string, true>>

export function useEditorBuffer({ activePath, workspaceKey }: UseEditorBufferArgs) {
  const [workspaceFileContents, setWorkspaceFileContents] = useState<WorkspaceContents>({})
  const [workspaceDirtyPaths, setWorkspaceDirtyPaths] = useState<WorkspaceDirtyPaths>({})

  const fileContents = useMemo(
    () => workspaceFileContents[workspaceKey] ?? EMPTY_FILE_CONTENTS,
    [workspaceFileContents, workspaceKey],
  )
  const dirtyPaths = useMemo(
    () => workspaceDirtyPaths[workspaceKey] ?? EMPTY_DIRTY_PATHS,
    [workspaceDirtyPaths, workspaceKey],
  )
  const editorValue = useMemo(
    () => (activePath ? (fileContents[activePath] ?? '') : ''),
    [activePath, fileContents],
  )

  const fileContentsRef = useRef<Record<string, string>>(fileContents)
  const activePathRef = useRef<string | null>(activePath)
  const workspaceKeyRef = useRef(workspaceKey)
  const syncTimers = useRef<Record<string, number>>({})
  const syncedContentsRef = useRef<Record<string, string>>({})
  const changeVersionRef = useRef<Record<string, number>>({})
  const loadToken = useRef(0)

  useEffect(() => {
    fileContentsRef.current = fileContents
  }, [fileContents])

  useEffect(() => {
    activePathRef.current = activePath
  }, [activePath])

  useEffect(() => {
    workspaceKeyRef.current = workspaceKey
  }, [workspaceKey])

  useEffect(() => {
    if (!isTauri()) return
    Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
    syncTimers.current = {}
    fileContentsRef.current = {}
    syncedContentsRef.current = {}
    changeVersionRef.current = {}
    loadToken.current += 1
    void invoke('fs_flush_buffers').catch((error) => {
      console.error('flush buffers on workspace switch failed', error)
    })
  }, [workspaceKey])

  useEffect(() => {
    if (!activePath) return
    if (!isTauri()) return

    const token = loadToken.current + 1
    loadToken.current = token
    void invoke<string>('fs_open_file', { path: activePath })
      .then((content) => {
        if (loadToken.current !== token) return
        const currentWorkspace = workspaceKeyRef.current
        setWorkspaceFileContents((prev) => {
          const currentWorkspaceContents = prev[currentWorkspace] ?? {}
          if (currentWorkspaceContents[activePath] === content) return prev
          return {
            ...prev,
            [currentWorkspace]: {
              ...currentWorkspaceContents,
              [activePath]: content,
            },
          }
        })
        syncedContentsRef.current[activePath] = content
        setWorkspaceDirtyPaths((prev) => {
          const currentWorkspaceDirty = prev[currentWorkspace] ?? {}
          if (!currentWorkspaceDirty[activePath]) return prev
          const nextWorkspaceDirty = { ...currentWorkspaceDirty }
          delete nextWorkspaceDirty[activePath]
          return {
            ...prev,
            [currentWorkspace]: nextWorkspaceDirty,
          }
        })
      })
      .catch((error) => {
        console.error('open file failed', error)
      })
  }, [activePath, workspaceKey])

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

    const currentWorkspace = workspaceKeyRef.current

    setWorkspaceFileContents((prev) => {
      const currentWorkspaceContents = prev[currentWorkspace] ?? {}
      if (currentWorkspaceContents[path] === value) return prev
      return {
        ...prev,
        [currentWorkspace]: {
          ...currentWorkspaceContents,
          [path]: value,
        },
      }
    })

    const nextVersion = (changeVersionRef.current[path] ?? 0) + 1
    changeVersionRef.current[path] = nextVersion

    const syncedValue = syncedContentsRef.current[path]
    setWorkspaceDirtyPaths((prev) => {
      const currentWorkspaceDirty = prev[currentWorkspace] ?? {}
      const isDirty = syncedValue !== value
      if (isDirty && currentWorkspaceDirty[path]) return prev
      if (!isDirty && !currentWorkspaceDirty[path]) return prev
      const nextWorkspaceDirty = { ...currentWorkspaceDirty }
      if (isDirty) {
        nextWorkspaceDirty[path] = true
      } else {
        delete nextWorkspaceDirty[path]
      }
      return {
        ...prev,
        [currentWorkspace]: nextWorkspaceDirty,
      }
    })

    if (!isTauri()) return
    const currentTimer = syncTimers.current[path]
    if (currentTimer) {
      window.clearTimeout(currentTimer)
    }

    syncTimers.current[path] = window.setTimeout(() => {
      const latestValue = fileContentsRef.current[path] ?? value
      const dispatchedVersion = changeVersionRef.current[path]
      void invoke('fs_update_buffer', { path, content: latestValue })
        .then(() => {
          const hasNewChange = changeVersionRef.current[path] !== dispatchedVersion
          const currentValue = fileContentsRef.current[path] ?? ''
          if (hasNewChange || currentValue !== latestValue) return
          syncedContentsRef.current[path] = latestValue
          setWorkspaceDirtyPaths((prev) => {
            const currentWorkspaceDirty = prev[currentWorkspace] ?? {}
            if (!currentWorkspaceDirty[path]) return prev
            const nextWorkspaceDirty = { ...currentWorkspaceDirty }
            delete nextWorkspaceDirty[path]
            return {
              ...prev,
              [currentWorkspace]: nextWorkspaceDirty,
            }
          })
        })
        .catch((error) => {
          console.error('update buffer failed', error)
        })
      delete syncTimers.current[path]
    }, BUFFER_SYNC_DEBOUNCE_MS)
  }, [])

  return {
    fileContents,
    editorValue,
    dirtyPaths,
    onEditorChange,
  }
}
