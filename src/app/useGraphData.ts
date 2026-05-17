import { useEffect, useState } from 'react'
import {
  buildGraph,
  buildGraphFromRustGraph,
  buildGraphFromWorkspaceIndex,
  type GraphData,
} from '@/logic/graph'
import { fsApi, type FsRootKind, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'

export function useGraphData(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
  workspaceIndex: FsWorkspaceIndex | null,
  activePath: string | null,
  rootKind: FsRootKind,
) {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const workspaceContents = useWorkspaceMarkdownContents(
    entries,
    fileContents,
    enabled && rootKind !== 'single' && !workspaceIndex,
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const updateGraph = (nextGraph: GraphData) => {
      if (!cancelled) {
        setGraph(nextGraph)
      }
    }

    if (rootKind === 'single' && activePath) {
      void fsApi
        .getOutlineGraph(activePath)
        .then((outlineGraph) => updateGraph(buildGraphFromRustGraph(outlineGraph)))
        .catch(() => updateGraph({ nodes: [], edges: [] }))
    } else if (workspaceIndex) {
      void fsApi
        .getWorkspaceGraph()
        .then((workspaceGraph) => updateGraph(buildGraphFromRustGraph(workspaceGraph)))
        .catch(() => {
          // Keep the existing frontend builder as a fallback while Rust graph generation evolves.
          updateGraph(buildGraphFromWorkspaceIndex(workspaceIndex))
        })
    } else {
      // keep heavy graph generation out of regular editor typing path unless graph view is active.
      void Promise.resolve().then(() => updateGraph(buildGraph(entries, workspaceContents)))
    }
    return () => {
      cancelled = true
    }
  }, [activePath, enabled, entries, rootKind, workspaceContents, workspaceIndex])

  return graph
}
