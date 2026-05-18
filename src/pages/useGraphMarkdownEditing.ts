import { useCallback, useMemo, useState } from 'react'
import type { GraphData } from '@/logic/graph'
import { patchGraphHeadingContent, patchGraphHeadingTitle } from '@/logic/graphOptimistic'
import {
  replaceMarkdownHeadingTitle,
  replaceMarkdownLineRange,
} from '@/logic/markdownDocumentEdits'
import type { MarkdownBlock } from '@/logic/markdownBlocks'

type UseGraphMarkdownEditingOptions = {
  graph: GraphData
  markdown: string
  onChange: (value: string) => void
}

type OptimisticGraphState = {
  baseGraph: GraphData
  graph: GraphData
}

export const useGraphMarkdownEditing = ({
  graph,
  markdown,
  onChange,
}: UseGraphMarkdownEditingOptions) => {
  const [optimisticGraph, setOptimisticGraph] = useState<OptimisticGraphState | null>(null)
  const editorGraph = optimisticGraph?.baseGraph === graph ? optimisticGraph.graph : graph
  const nodesById = useMemo(
    () => new Map(editorGraph.nodes.map((node) => [node.id, node])),
    [editorGraph.nodes],
  )

  const updateHeadingTitle = useCallback(
    (nodeId: string, title: string) => {
      const node = nodesById.get(nodeId)
      const headingLine = node?.data.line
      const level = node?.data.level
      if (!headingLine || !level) return

      onChange(replaceMarkdownHeadingTitle(markdown, headingLine, level, title))
      setOptimisticGraph((current) => {
        const currentGraph = current?.baseGraph === graph ? current.graph : graph
        return {
          baseGraph: graph,
          graph: patchGraphHeadingTitle(currentGraph, nodeId, title),
        }
      })
    },
    [graph, markdown, nodesById, onChange],
  )

  const updateHeadingContent = useCallback(
    (nodeId: string, content: string, contentBlocks?: MarkdownBlock[]) => {
      const node = nodesById.get(nodeId)
      const startLine = node?.data.contentStartLine
      const endLine = node?.data.contentEndLine
      if (!startLine || !endLine) return

      onChange(replaceMarkdownLineRange(markdown, startLine, endLine, content))
      setOptimisticGraph((current) => {
        const currentGraph = current?.baseGraph === graph ? current.graph : graph
        return {
          baseGraph: graph,
          graph: patchGraphHeadingContent(currentGraph, nodeId, content, contentBlocks),
        }
      })
    },
    [graph, markdown, nodesById, onChange],
  )

  return {
    editorGraph,
    updateHeadingContent,
    updateHeadingTitle,
  }
}
