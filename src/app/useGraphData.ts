import { useEffect, useState } from 'react'
import { buildGraph, type GraphData } from '@/logic/graph'
import type { FileEntry } from '@/store/useAppStore'

export function useGraphData(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
) {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })

  useEffect(() => {
    if (!enabled) return
    // keep heavy graph generation out of regular editor typing path unless graph view is active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGraph(buildGraph(entries, fileContents))
  }, [enabled, entries, fileContents])

  return graph
}
