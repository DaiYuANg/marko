import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLatest, useUnmount } from 'ahooks'
import { produce } from 'immer'
import { fsApi } from '@/services/fsApi'
import { isTauriRuntime } from '@/utils/tauri'

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

  const fileContentsRef = useLatest(fileContents)
  const activePathRef = useLatest(activePath)
  const workspaceKeyRef = useLatest(workspaceKey)
  const syncTimers = useRef<Record<string, number>>({})
  const syncedContentsRef = useRef<Record<string, string>>({})
  const changeVersionRef = useRef<Record<string, number>>({})
  const loadToken = useRef(0)

  useEffect(() => {
    if (!isTauriRuntime()) return
    Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
    syncTimers.current = {}
    syncedContentsRef.current = {}
    changeVersionRef.current = {}
    loadToken.current += 1
    void fsApi.flushBuffers().catch((error) => {
      console.error('flush buffers on workspace switch failed', error)
    })
  }, [workspaceKey])

  useEffect(() => {
    if (!activePath) return
    if (!isTauriRuntime()) return

    const token = loadToken.current + 1
    loadToken.current = token
    void fsApi
      .openFile(activePath)
      .then((content) => {
        if (loadToken.current !== token) return
        const currentWorkspace = workspaceKeyRef.current
        setWorkspaceFileContents((prev) =>
          produce(prev, (draft) => {
            const currentWorkspaceContents =
              draft[currentWorkspace] ?? (draft[currentWorkspace] = {})
            if (currentWorkspaceContents[activePath] === content) return
            currentWorkspaceContents[activePath] = content
          }),
        )
        syncedContentsRef.current[activePath] = content
        setWorkspaceDirtyPaths((prev) =>
          produce(prev, (draft) => {
            const currentWorkspaceDirty = draft[currentWorkspace]
            if (!currentWorkspaceDirty?.[activePath]) return
            delete currentWorkspaceDirty[activePath]
          }),
        )
      })
      .catch((error) => {
        console.error('open file failed', error)
      })
  }, [activePath, workspaceKey, workspaceKeyRef])

  useUnmount(() => {
    Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
    syncTimers.current = {}
    if (isTauriRuntime()) {
      void fsApi.flushBuffers().catch((error) => {
        console.error('flush buffers on unmount failed', error)
      })
    }
  })

  const onEditorChange = useCallback(
    (value: string) => {
      const path = activePathRef.current
      if (!path) return

      const currentWorkspace = workspaceKeyRef.current

      setWorkspaceFileContents((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceContents = draft[currentWorkspace] ?? (draft[currentWorkspace] = {})
          if (currentWorkspaceContents[path] === value) return
          currentWorkspaceContents[path] = value
        }),
      )

      const nextVersion = (changeVersionRef.current[path] ?? 0) + 1
      changeVersionRef.current[path] = nextVersion

      const syncedValue = syncedContentsRef.current[path]
      setWorkspaceDirtyPaths((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceDirty = draft[currentWorkspace] ?? (draft[currentWorkspace] = {})
          const isDirty = syncedValue !== value
          if (isDirty) {
            currentWorkspaceDirty[path] = true
            return
          }
          if (!currentWorkspaceDirty[path]) return
          delete currentWorkspaceDirty[path]
        }),
      )

      if (!isTauriRuntime()) return
      const currentTimer = syncTimers.current[path]
      if (currentTimer) {
        window.clearTimeout(currentTimer)
      }

      syncTimers.current[path] = window.setTimeout(() => {
        const latestValue = fileContentsRef.current[path] ?? value
        const dispatchedVersion = changeVersionRef.current[path]
        void fsApi
          .updateBuffer(path, latestValue)
          .then(() => {
            const hasNewChange = changeVersionRef.current[path] !== dispatchedVersion
            const currentValue = fileContentsRef.current[path] ?? ''
            if (hasNewChange || currentValue !== latestValue) return
            syncedContentsRef.current[path] = latestValue
            setWorkspaceDirtyPaths((prev) =>
              produce(prev, (draft) => {
                const currentWorkspaceDirty = draft[currentWorkspace]
                if (!currentWorkspaceDirty?.[path]) return
                delete currentWorkspaceDirty[path]
              }),
            )
          })
          .catch((error) => {
            console.error('update buffer failed', error)
          })
        delete syncTimers.current[path]
      }, BUFFER_SYNC_DEBOUNCE_MS)
    },
    [activePathRef, fileContentsRef, workspaceKeyRef],
  )

  return {
    fileContents,
    editorValue,
    dirtyPaths,
    onEditorChange,
  }
}
