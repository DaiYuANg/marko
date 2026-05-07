import { useEffect, useState } from 'react'
import { buildGraph, buildGraphFromWorkspaceIndex, type GraphData } from '@/logic/graph'
import type { FileEntry } from '@/store/useAppStore'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'

export function useGraphData(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
) {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const workspaceIndex = useWorkspaceIndex(entries, enabled)
  const workspaceContents = useWorkspaceMarkdownContents(
    entries,
    fileContents,
    enabled && !workspaceIndex,
  )

  useEffect(() => {
    if (!enabled) return
    if (workspaceIndex) {
      // Rust owns Markdown parsing and link normalization; the frontend keeps layout/rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGraph(buildGraphFromWorkspaceIndex(workspaceIndex))
      return
    }
    // keep heavy graph generation out of regular editor typing path unless graph view is active.

    setGraph(buildGraph(entries, workspaceContents))
  }, [enabled, entries, workspaceContents, workspaceIndex])

  return graph
}
