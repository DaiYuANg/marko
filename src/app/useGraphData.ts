import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  buildGraph,
  buildGraphFromRustGraph,
  buildGraphFromWorkspaceIndex,
  type GraphData,
} from '@/logic/graph'
import { fsApi, type FsRootKind, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'
import { isTauriRuntime } from '@/utils/tauri'

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], layoutKey: 'empty' }

export function useGraphData(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
  workspaceIndex: FsWorkspaceIndex | null,
  activePath: string | null,
  rootKind: FsRootKind,
) {
  const tauriAvailable = isTauriRuntime()
  const workspaceContents = useWorkspaceMarkdownContents(
    entries,
    fileContents,
    enabled && rootKind !== 'single' && !workspaceIndex,
  )
  const workspaceIndexKey = useMemo(() => {
    if (!workspaceIndex) return ''
    return workspaceIndex.files
      .map((file) => `${file.path}:${file.headings.length}:${file.links.length}`)
      .join('\n')
  }, [workspaceIndex])

  const outlineQuery = useQuery({
    queryKey: ['outline-graph', activePath],
    queryFn: () => fsApi.getOutlineGraph(activePath ?? ''),
    enabled: enabled && tauriAvailable && rootKind === 'single' && Boolean(activePath),
    staleTime: 2_000,
  })

  const workspaceGraphQuery = useQuery({
    queryKey: ['workspace-graph', workspaceIndexKey],
    queryFn: () => fsApi.getWorkspaceGraph(),
    enabled: enabled && tauriAvailable && rootKind !== 'single' && Boolean(workspaceIndex),
    staleTime: 2_000,
  })

  return useMemo(() => {
    if (!enabled) return EMPTY_GRAPH

    if (rootKind === 'single') {
      return outlineQuery.data ? buildGraphFromRustGraph(outlineQuery.data) : EMPTY_GRAPH
    }

    if (workspaceIndex) {
      if (workspaceGraphQuery.data) {
        return buildGraphFromRustGraph(workspaceGraphQuery.data)
      }
      // Keep the existing frontend builder as a fallback while Rust graph generation evolves.
      return buildGraphFromWorkspaceIndex(workspaceIndex)
    }

    return buildGraph(entries, workspaceContents)
  }, [
    enabled,
    entries,
    outlineQuery.data,
    rootKind,
    workspaceContents,
    workspaceGraphQuery.data,
    workspaceIndex,
  ])
}
