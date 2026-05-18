import type { GraphData } from '@/logic/graph'
import type { MarkdownBlock } from '@/logic/markdownBlocks'

export const patchGraphHeadingTitle = (graph: GraphData, nodeId: string, title: string) => {
  let changed = false
  const nodes = graph.nodes.map((node) => {
    if (node.id !== nodeId || node.data.label === title) return node
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        label: title,
      },
    }
  })

  return changed ? { ...graph, nodes } : graph
}

export const patchGraphHeadingContent = (
  graph: GraphData,
  nodeId: string,
  content: string,
  contentBlocks?: MarkdownBlock[],
) => {
  const target = graph.nodes.find((node) => node.id === nodeId)
  const previousStartLine = target?.data.contentStartLine
  const previousEndLine = target?.data.contentEndLine
  const nextEndLine =
    previousStartLine === undefined ? undefined : previousStartLine + countMarkdownLines(content)
  const lineDelta =
    previousEndLine === undefined || nextEndLine === undefined ? 0 : nextEndLine - previousEndLine
  let changed = false

  const nodes = graph.nodes.map((node) => {
    if (node.id === nodeId) {
      changed = true
      return {
        ...node,
        data: {
          ...node.data,
          content,
          contentBlocks,
          contentEndLine: nextEndLine,
        },
      }
    }

    if (!previousEndLine || lineDelta === 0) return node
    const line = shiftLineAfter(node.data.line, previousEndLine, lineDelta)
    const contentStartLine = shiftLineAfter(node.data.contentStartLine, previousEndLine, lineDelta)
    const contentEndLine = shiftLineAfter(node.data.contentEndLine, previousEndLine, lineDelta)
    if (
      line === node.data.line &&
      contentStartLine === node.data.contentStartLine &&
      contentEndLine === node.data.contentEndLine
    ) {
      return node
    }
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        line,
        contentStartLine,
        contentEndLine,
      },
    }
  })

  return changed ? { ...graph, nodes } : graph
}

const countMarkdownLines = (content: string) => {
  if (content.length === 0) return 0
  return content.split(/\r\n|\r|\n/).length
}

const shiftLineAfter = (line: number | undefined, afterLine: number, delta: number) => {
  if (line === undefined || line < afterLine) return line
  return Math.max(1, line + delta)
}
