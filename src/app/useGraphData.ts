import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildGraphFromRustGraph, type GraphData } from '@/logic/graph'
import { fsApi, type FsRootKind, type FsWorkspaceIndex } from '@/services/fsApi'
import { isTauriRuntime } from '@/utils/tauri'

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], layoutKey: 'empty' }

export function useGraphData(
  enabled: boolean,
  workspaceIndex: FsWorkspaceIndex | null,
  activePath: string | null,
  rootKind: FsRootKind,
) {
  const tauriAvailable = isTauriRuntime()
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
    }

    return EMPTY_GRAPH
  }, [enabled, outlineQuery.data, rootKind, workspaceGraphQuery.data, workspaceIndex])
}
