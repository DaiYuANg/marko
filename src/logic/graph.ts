import type { Edge, Node } from 'reactflow'
import type { MarkdownFile } from '@/store/useAppStore'
import { createFileLabel, extractLinks, isExternalLink, resolveRelativePath } from '@/logic/paths'

export type GraphData = {
  nodes: Node[]
  edges: Edge[]
}

export function buildGraph(files: MarkdownFile[], contents: Record<string, string>): GraphData {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const fileNodes = new Map<string, Node>()
  const nameIndex = new Map<string, string>()

  files.forEach((file) => {
    const label = createFileLabel(file.relative_path)
    nameIndex.set(label.toLowerCase(), file.relative_path)
    fileNodes.set(file.relative_path, {
      id: `file:${file.relative_path}`,
      data: { label },
      position: { x: 0, y: 0 },
    })
  })

  const externalNodes = new Map<string, Node>()
  const missingNodes = new Map<string, Node>()

  files.forEach((file) => {
    const sourceId = `file:${file.relative_path}`
    const content = contents[file.relative_path] ?? ''
    const links = extractLinks(content)

    links.forEach((link) => {
      if (!link.target || link.target.trim().length === 0) {
        return
      }
      if (isExternalLink(link.target)) {
        const url = link.target
        if (!externalNodes.has(url)) {
          const hostname = url.replace(/^https?:\/\//i, '').split('/')[0] ?? url
          externalNodes.set(url, {
            id: `ext:${url}`,
            type: 'external',
            data: { label: link.text || hostname, subtitle: hostname, url },
            position: { x: 0, y: 0 },
          })
        }
        edges.push({
          id: `${sourceId}->ext:${url}-${edges.length}`,
          source: sourceId,
          target: `ext:${url}`,
        })
        return
      }

      let targetPath = link.target
      if (link.type === 'wiki') {
        const mapped = nameIndex.get(link.target.toLowerCase())
        if (mapped) {
          targetPath = mapped
        } else {
          targetPath = `${link.target}.md`
        }
      } else {
        const normalized = resolveRelativePath(file.relative_path, link.target)
        if (!normalized) {
          return
        }
        targetPath = normalized.endsWith('.md') || normalized.endsWith('.markdown')
          ? normalized
          : `${normalized}.md`
      }

      if (fileNodes.has(targetPath)) {
        edges.push({
          id: `${sourceId}->file:${targetPath}-${edges.length}`,
          source: sourceId,
          target: `file:${targetPath}`,
        })
        return
      }

      if (!missingNodes.has(targetPath)) {
        missingNodes.set(targetPath, {
          id: `missing:${targetPath}`,
          type: 'missing',
          data: { label: createFileLabel(targetPath), subtitle: targetPath },
          position: { x: 0, y: 0 },
        })
      }

      edges.push({
        id: `${sourceId}->missing:${targetPath}-${edges.length}`,
        source: sourceId,
        target: `missing:${targetPath}`,
      })
    })
  })

  const allNodes = [...fileNodes.values(), ...externalNodes.values(), ...missingNodes.values()]
  allNodes.forEach((node, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    node.position = { x: column * 240, y: row * 150 }
    nodes.push(node)
  })

  return { nodes, edges }
}
