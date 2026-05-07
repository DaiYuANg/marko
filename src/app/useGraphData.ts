import { useEffect, useState } from 'react'
import { buildGraph, type GraphData } from '@/logic/graph'
import type { FileEntry } from '@/store/useAppStore'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'

export function useGraphData(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
) {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const workspaceContents = useWorkspaceMarkdownContents(entries, fileContents, enabled)

  useEffect(() => {
    if (!enabled) return
    // keep heavy graph generation out of regular editor typing path unless graph view is active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGraph(buildGraph(entries, workspaceContents))
  }, [enabled, entries, workspaceContents])

  return graph
}
