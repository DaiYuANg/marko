import { useEffect, useMemo, useState } from 'react'
import { fsApi } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { isTauriRuntime } from '@/utils/tauri'

export function useWorkspaceMarkdownContents(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
) {
  const [diskContents, setDiskContents] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!enabled) return
    const files = entries.filter((entry) => entry.kind === 'file')
    if (!isTauriRuntime()) {
      return
    }

    let cancelled = false

    const loadContents = async () => {
      const loaded = await Promise.all(
        files.map(async (file) => {
          const content = await fsApi.readFile(file.path)
          return [file.path, content] as const
        }),
      )
      if (cancelled) return
      setDiskContents(Object.fromEntries(loaded))
    }

    void loadContents().catch((error) => {
      if (cancelled) return
      console.error('load workspace markdown contents failed', error)
      setDiskContents({})
    })

    return () => {
      cancelled = true
    }
  }, [enabled, entries])

  return useMemo(
    () => ({
      ...diskContents,
      ...fileContents,
    }),
    [diskContents, fileContents],
  )
}
