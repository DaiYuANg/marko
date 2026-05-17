import React, { useEffect } from 'react'
import { GitGraph } from 'lucide-react'
import { Background, Controls, ReactFlow, useEdgesState, useNodesState } from 'reactflow'
import type { GraphData } from '@/logic/graph'
import { ExternalNode, HeadingNode, MissingNode } from '@/components/GraphNodes'
import { useI18n } from '@/i18n/useI18n'

const nodeTypes = { external: ExternalNode, missing: MissingNode, heading: HeadingNode }

type GraphPageProps = {
  graph: GraphData
  onOpenFile: (path: string) => void
}

const GraphPageComponent = ({ graph, onOpenFile }: GraphPageProps) => {
  const { t } = useI18n()
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph.edges, graph.nodes, setEdges, setNodes])

  return (
    <div className="relative h-full bg-background">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm">
        <GitGraph className="h-3.5 w-3.5 text-primary" />
        <span>
          {nodes.length} {t('graph.nodes')}
        </span>
        <span className="h-3 w-px bg-border" />
        <span>
          {edges.length} {t('graph.edges')}
        </span>
      </div>
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        preventScrolling
        onlyRenderVisibleElements
        minZoom={0.15}
        maxZoom={2.2}
        onNodeClick={(_, node) => {
          if (node.id.startsWith('file:')) {
            onOpenFile(node.id.replace('file:', ''))
            return
          }
          const path = typeof node.data?.path === 'string' ? node.data.path : null
          if (path) {
            onOpenFile(path)
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.22 }}
      >
        <Background gap={16} size={1} />
        <Controls />
      </ReactFlow>
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-md border border-border bg-card/95 p-5 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <GitGraph className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm font-semibold">{t('graph.emptyTitle')}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('graph.emptyDescription')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const GraphPage = React.memo(GraphPageComponent)
export default GraphPage
