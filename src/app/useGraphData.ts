import { useMemo, useRef } from 'react'
import { buildGraph, type GraphData } from '@/logic/graph'
import type { MarkdownFile } from '@/store/useAppStore'

export function useGraphData(
  files: MarkdownFile[],
  fileContents: Record<string, string>,
  pathname: string,
) {
  const graphRef = useRef<GraphData>({ nodes: [], edges: [] })

  return useMemo(() => {
    if (!pathname.includes('graph')) return graphRef.current
    const next = buildGraph(files, fileContents)
    graphRef.current = next
    return next
  }, [files, fileContents, pathname])
}
