import { useCallback, useEffect, useState } from 'react'
import { fsApi, fsBufferStatusSchema, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { isTauriRuntime } from '@/utils/tauri'

export function useWorkspaceIndex(entries: FileEntry[], enabled: boolean) {
  const [index, setIndex] = useState<FsWorkspaceIndex | null>(null)

  const refreshIndex = useCallback(async () => {
    if (!enabled || !isTauriRuntime()) {
      setIndex(null)
      return
    }
    const next = await fsApi.getWorkspaceIndex()
    setIndex(next)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) {
      setIndex(null)
      return
    }

    let cancelled = false
    void fsApi
      .getWorkspaceIndex()
      .then((next) => {
        if (cancelled) return
        setIndex(next)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('load workspace index failed', error)
        setIndex(null)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, entries])

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return

    let cancelled = false
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<unknown>('fs-buffer-status', (event) => {
        const parsed = fsBufferStatusSchema.safeParse(event.payload)
        if (!parsed.success || parsed.data.dirty) return
        void refreshIndex().catch((error) => {
          console.error('refresh workspace index failed', error)
        })
      }).then((nextUnlisten) => {
        if (cancelled) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
      }),
    )

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled, refreshIndex])

  return index
}
