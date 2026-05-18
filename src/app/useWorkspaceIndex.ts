import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fsApi, fsBufferStatusSchema, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { isTauriRuntime } from '@/utils/tauri'

export function useWorkspaceIndex(entries: FileEntry[], enabled: boolean) {
  const queryClient = useQueryClient()
  const tauriAvailable = isTauriRuntime()
  const entriesKey = useMemo(
    () => entries.map((entry) => `${entry.kind}:${entry.path}`).join('\n'),
    [entries],
  )
  const query = useQuery<FsWorkspaceIndex | null>({
    queryKey: ['workspace-index', entriesKey],
    queryFn: () => fsApi.getWorkspaceIndex(),
    enabled: enabled && tauriAvailable,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!enabled || !tauriAvailable) return

    let cancelled = false
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<unknown>('fs-buffer-status', (event) => {
        const parsed = fsBufferStatusSchema.safeParse(event.payload)
        if (!parsed.success) return
        void queryClient.invalidateQueries({ queryKey: ['workspace-index'] }).catch((error) => {
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
  }, [enabled, queryClient, tauriAvailable])

  return query.data ?? null
}
