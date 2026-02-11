import { useEffect, useState } from 'react'
import { buildGraph, type GraphData } from '@/logic/graph'
import type { FileEntry } from '@/store/useAppStore'

export function useGraphData(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  pathname: string,
) {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })

  useEffect(() => {
    if (!pathname.includes('graph')) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGraph(buildGraph(entries, fileContents))
  }, [entries, fileContents, pathname])

  return graph
}
