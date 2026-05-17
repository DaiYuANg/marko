import type { Edge, Node } from 'reactflow'
import type { FileEntry } from '@/store/useAppStore'
import type { FsGraph, FsWorkspaceIndex } from '@/services/fsApi'
import {
  createFileLabel,
  extractHeadings,
  extractLinks,
  isExternalLink,
  normalizeHeadingAnchor,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'

export type GraphData = {
  nodes: Node[]
  edges: Edge[]
}

type NodeKind = 'file' | 'heading' | 'missing' | 'external'

type LayoutNode = {
  id: string
  kind: NodeKind
  level: number
  x: number
  y: number
  anchorX: number
  anchorY: number
}

const LEVEL_GAP = 320
const ROW_GAP = 120
const OUTLINE_LEVEL_GAP = 280
const OUTLINE_ROW_GAP = 96
const FORCE_ITERATIONS = 130
const MAX_FORCE_NODES = 340

export function buildGraph(entries: FileEntry[], contents: Record<string, string>): GraphData {
  const edges: Edge[] = []

  const fileNodes = new Map<string, Node>()
  const nameIndex = new Map<string, string>()

  entries
    .filter((entry) => entry.kind === 'file')
    .forEach((entry) => {
      const label = createFileLabel(entry.path)
      nameIndex.set(label.toLowerCase(), entry.path)
      fileNodes.set(entry.path, {
        id: `file:${entry.path}`,
        data: { label },
        position: { x: 0, y: 0 },
      })
    })

  const externalNodes = new Map<string, Node>()
  const missingNodes = new Map<string, Node>()
  const headingNodes = new Map<string, Node>()
  const headingSlugIndex = new Map<string, Map<string, string>>()

  entries
    .filter((entry) => entry.kind === 'file')
    .forEach((entry) => {
      const sourceId = `file:${entry.path}`
      const content = contents[entry.path] ?? ''
      const headings = extractHeadings(content)
      const headingIdsBySlug = new Map<string, string>()
      headingSlugIndex.set(entry.path, headingIdsBySlug)

      const headingStack: Array<{ level: number; id: string }> = []
      headings.forEach((heading) => {
        const headingId = `heading:${entry.path}:${heading.slug}`
        headingIdsBySlug.set(heading.slug, headingId)
        headingNodes.set(headingId, {
          id: headingId,
          type: 'heading',
          data: { label: heading.text, subtitle: `H${heading.level}` },
          position: { x: 0, y: 0 },
        })
        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].level >= heading.level
        ) {
          headingStack.pop()
        }
        const parentId = headingStack[headingStack.length - 1]?.id ?? sourceId
        edges.push({
          id: `${parentId}->${headingId}-${edges.length}`,
          source: parentId,
          target: headingId,
        })
        headingStack.push({ level: heading.level, id: headingId })
      })
    })

  entries
    .filter((entry) => entry.kind === 'file')
    .forEach((entry) => {
      const sourceId = `file:${entry.path}`
      const content = contents[entry.path] ?? ''
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

        const { path: linkPath, anchor } = splitLinkTarget(link.target)
        const anchorSlug = anchor ? normalizeHeadingAnchor(anchor) : ''
        let targetPath = linkPath
        if (link.type === 'wiki') {
          const mapped = nameIndex.get(linkPath.toLowerCase())
          targetPath = mapped ?? `${linkPath}.md`
        } else {
          if (linkPath.trim().length === 0) {
            targetPath = entry.path
          } else {
            const normalized = resolveRelativePath(entry.path, linkPath)
            if (!normalized) {
              return
            }
            targetPath =
              normalized.endsWith('.md') || normalized.endsWith('.markdown')
                ? normalized
                : `${normalized}.md`
          }
        }

        const targetHeadingId = anchorSlug
          ? headingSlugIndex.get(targetPath)?.get(anchorSlug)
          : undefined
        if (targetHeadingId) {
          edges.push({
            id: `${sourceId}->${targetHeadingId}-${edges.length}`,
            source: sourceId,
            target: targetHeadingId,
          })
          return
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

  const nodes = [
    ...fileNodes.values(),
    ...headingNodes.values(),
    ...externalNodes.values(),
    ...missingNodes.values(),
  ]
  if (nodes.length === 0) {
    return { nodes, edges }
  }

  applyGraphLayout(nodes, edges)
  return { nodes, edges }
}

export function buildGraphFromWorkspaceIndex(index: FsWorkspaceIndex): GraphData {
  const edges: Edge[] = []
  const fileNodes = new Map<string, Node>()
  const externalNodes = new Map<string, Node>()
  const missingNodes = new Map<string, Node>()
  const headingNodes = new Map<string, Node>()
  const headingSlugIndex = new Map<string, Map<string, string>>()

  index.files.forEach((file) => {
    const label = createFileLabel(file.path)
    fileNodes.set(file.path, {
      id: `file:${file.path}`,
      data: { label },
      position: { x: 0, y: 0 },
    })
  })

  index.files.forEach((file) => {
    const sourceId = `file:${file.path}`
    const headingIdsBySlug = new Map<string, string>()
    headingSlugIndex.set(file.path, headingIdsBySlug)

    const headingStack: Array<{ level: number; id: string }> = []
    file.headings.forEach((heading) => {
      const headingId = `heading:${file.path}:${heading.slug}`
      headingIdsBySlug.set(heading.slug, headingId)
      headingNodes.set(headingId, {
        id: headingId,
        type: 'heading',
        data: { label: heading.text, subtitle: `H${heading.level}` },
        position: { x: 0, y: 0 },
      })
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= heading.level
      ) {
        headingStack.pop()
      }
      const parentId = headingStack[headingStack.length - 1]?.id ?? sourceId
      edges.push({
        id: `${parentId}->${headingId}-${edges.length}`,
        source: parentId,
        target: headingId,
      })
      headingStack.push({ level: heading.level, id: headingId })
    })
  })

  index.files.forEach((file) => {
    const sourceId = `file:${file.path}`
    file.links.forEach((link) => {
      if (link.is_external) {
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

      const targetPath = link.target_path
      if (!targetPath) return

      const targetHeadingId = link.target_heading_slug
        ? headingSlugIndex.get(targetPath)?.get(link.target_heading_slug)
        : undefined
      if (targetHeadingId) {
        edges.push({
          id: `${sourceId}->${targetHeadingId}-${edges.length}`,
          source: sourceId,
          target: targetHeadingId,
        })
        return
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

  const nodes = [
    ...fileNodes.values(),
    ...headingNodes.values(),
    ...externalNodes.values(),
    ...missingNodes.values(),
  ]
  if (nodes.length === 0) {
    return { nodes, edges }
  }

  applyGraphLayout(nodes, edges)
  return { nodes, edges }
}

export function buildGraphFromRustGraph(graph: FsGraph): GraphData {
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.kind === 'file' ? undefined : node.kind,
    data: {
      label: node.label,
      subtitle:
        node.kind === 'heading' && node.level
          ? `H${node.level}`
          : (node.path ?? node.slug ?? undefined),
      path: node.path ?? undefined,
      line: node.line ?? undefined,
      level: node.level ?? undefined,
      slug: node.slug ?? undefined,
    },
    position: { x: 0, y: 0 },
  }))
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.kind === 'contains' ? 'smoothstep' : undefined,
  }))

  if (nodes.length > 0 && graph.mode === 'outline') {
    applyOutlineLayout(nodes)
  } else if (nodes.length > 0) {
    applyGraphLayout(nodes, edges)
  }
  return { nodes, edges }
}

const applyOutlineLayout = (nodes: Node[]) => {
  const orderedNodes = [...nodes].sort((a, b) => {
    if (a.id.startsWith('file:')) return -1
    if (b.id.startsWith('file:')) return 1
    const lineA = typeof a.data?.line === 'number' ? a.data.line : Number.MAX_SAFE_INTEGER
    const lineB = typeof b.data?.line === 'number' ? b.data.line : Number.MAX_SAFE_INTEGER
    return lineA === lineB ? a.id.localeCompare(b.id) : lineA - lineB
  })

  orderedNodes.forEach((node, index) => {
    const level = typeof node.data?.level === 'number' ? node.data.level : 0
    node.position = {
      x: 120 + Math.max(level, 0) * OUTLINE_LEVEL_GAP,
      y: 120 + index * OUTLINE_ROW_GAP,
    }
  })
}

const applyGraphLayout = (nodes: Node[], edges: Edge[]) => {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const levels = buildHierarchyLevels(nodes, edges, nodeIds)
  const positioned = buildInitialLayout(nodes, levels)
  if (nodes.length <= MAX_FORCE_NODES) {
    runForceRelaxation(positioned, edges)
  }
  normalizeLayout(positioned)

  const positionMap = new Map<string, { x: number; y: number }>()
  positioned.forEach((node) => {
    positionMap.set(node.id, { x: node.x, y: node.y })
  })
  nodes.forEach((node) => {
    node.position = positionMap.get(node.id) ?? { x: 0, y: 0 }
  })
}

const buildHierarchyLevels = (nodes: Node[], edges: Edge[], nodeIds: Set<string>) => {
  const incomingCount = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const levels = new Map<string, number>()

  nodes.forEach((node) => {
    incomingCount.set(node.id, 0)
    outgoing.set(node.id, [])
  })

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })

  const queue: string[] = []
  incomingCount.forEach((count, id) => {
    if (count === 0) {
      queue.push(id)
      levels.set(id, 0)
    }
  })
  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id)
    levels.set(nodes[0].id, 0)
  }

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const currentLevel = levels.get(current) ?? 0
    const nextNodes = outgoing.get(current) ?? []
    nextNodes.forEach((nextId) => {
      const nextLevel = Math.max(levels.get(nextId) ?? 0, currentLevel + 1)
      levels.set(nextId, nextLevel)
      const nextIncoming = (incomingCount.get(nextId) ?? 1) - 1
      incomingCount.set(nextId, nextIncoming)
      if (nextIncoming <= 0) {
        queue.push(nextId)
      }
    })
  }

  nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0)
    }
  })
  return levels
}

const buildInitialLayout = (nodes: Node[], levels: Map<string, number>): LayoutNode[] => {
  const levelBuckets = new Map<number, LayoutNode[]>()

  nodes.forEach((node) => {
    const level = levels.get(node.id) ?? 0
    const item: LayoutNode = {
      id: node.id,
      kind: classifyNodeKind(node),
      level,
      x: 0,
      y: 0,
      anchorX: 0,
      anchorY: 0,
    }
    if (!levelBuckets.has(level)) {
      levelBuckets.set(level, [])
    }
    levelBuckets.get(level)?.push(item)
  })

  const sortedLevels = Array.from(levelBuckets.keys()).sort((a, b) => a - b)
  sortedLevels.forEach((level) => {
    const bucket = levelBuckets.get(level) ?? []
    bucket.sort((a, b) => {
      const kindOrder = nodeKindWeight(a.kind) - nodeKindWeight(b.kind)
      return kindOrder !== 0 ? kindOrder : a.id.localeCompare(b.id)
    })
    const startY = -((bucket.length - 1) * ROW_GAP) / 2
    bucket.forEach((node, index) => {
      const laneOffset = (nodeKindWeight(node.kind) - 1.5) * 34
      node.anchorX = level * LEVEL_GAP
      node.anchorY = startY + index * ROW_GAP + laneOffset
      node.x = node.anchorX
      node.y = node.anchorY
    })
  })

  return sortedLevels.flatMap((level) => levelBuckets.get(level) ?? [])
}

const runForceRelaxation = (nodes: LayoutNode[], edges: Edge[]) => {
  const idToIndex = new Map<string, number>()
  nodes.forEach((node, index) => idToIndex.set(node.id, index))

  const velocityX = new Array(nodes.length).fill(0)
  const velocityY = new Array(nodes.length).fill(0)

  const linkPairs: Array<[number, number, number]> = []
  edges.forEach((edge) => {
    const sourceIndex = idToIndex.get(edge.source)
    const targetIndex = idToIndex.get(edge.target)
    if (sourceIndex === undefined || targetIndex === undefined) return
    const sourceKind = nodes[sourceIndex].kind
    const targetKind = nodes[targetIndex].kind
    const desiredLength =
      sourceKind === 'file' && targetKind === 'heading'
        ? 140
        : sourceKind === 'file' && targetKind === 'file'
          ? 220
          : 190
    linkPairs.push([sourceIndex, targetIndex, desiredLength])
  })

  for (let iteration = 0; iteration < FORCE_ITERATIONS; iteration += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const distSq = Math.max(dx * dx + dy * dy, 1800)
        const dist = Math.sqrt(distSq)
        const repulsion = 62000 / distSq
        const fx = (repulsion * dx) / dist
        const fy = (repulsion * dy) / dist
        velocityX[i] -= fx
        velocityY[i] -= fy
        velocityX[j] += fx
        velocityY[j] += fy
      }
    }

    linkPairs.forEach(([from, to, desiredLength]) => {
      const dx = nodes[to].x - nodes[from].x
      const dy = nodes[to].y - nodes[from].y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const spring = (dist - desiredLength) * 0.026
      const fx = (spring * dx) / dist
      const fy = (spring * dy) / dist
      velocityX[from] += fx
      velocityY[from] += fy
      velocityX[to] -= fx
      velocityY[to] -= fy
    })

    for (let i = 0; i < nodes.length; i += 1) {
      velocityX[i] += (nodes[i].anchorX - nodes[i].x) * 0.012
      velocityY[i] += (nodes[i].anchorY - nodes[i].y) * 0.008
      velocityX[i] *= 0.86
      velocityY[i] *= 0.86
      nodes[i].x += velocityX[i]
      nodes[i].y += velocityY[i]
    }
  }
}

const normalizeLayout = (nodes: LayoutNode[]) => {
  if (nodes.length === 0) return
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  nodes.forEach((node) => {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
  })
  const offsetX = 120 - minX
  const offsetY = 120 - minY
  nodes.forEach((node) => {
    node.x += offsetX
    node.y += offsetY
  })
}

const classifyNodeKind = (node: Node): NodeKind => {
  if (node.id.startsWith('file:')) return 'file'
  if (node.type === 'heading' || node.id.startsWith('heading:')) return 'heading'
  if (node.type === 'external' || node.id.startsWith('ext:')) return 'external'
  return 'missing'
}

const nodeKindWeight = (kind: NodeKind) => {
  if (kind === 'file') return 0
  if (kind === 'heading') return 1
  if (kind === 'missing') return 2
  return 3
}
