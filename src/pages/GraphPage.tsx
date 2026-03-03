import React, { useMemo } from 'react'
import { Background, Controls, ReactFlow } from 'reactflow'
import type { GraphData } from '@/logic/graph'
import { ExternalNode, HeadingNode, MissingNode } from '@/components/GraphNodes'

const nodeTypes = { external: ExternalNode, missing: MissingNode, heading: HeadingNode }

type GraphPageProps = {
  graph: GraphData
  onOpenFile: (path: string) => void
}

const GraphPageComponent = ({ graph, onOpenFile }: GraphPageProps) => {
  const nodes = useMemo(() => graph.nodes, [graph.nodes])
  const edges = useMemo(() => graph.edges, [graph.edges])

  return (
    <div className="h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        minZoom={0.2}
        maxZoom={2}
        onNodeClick={(_, node) => {
          if (node.id.startsWith('file:')) {
            onOpenFile(node.id.replace('file:', ''))
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.18 }}
      >
        <Background gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  )
}

const GraphPage = React.memo(GraphPageComponent)
export default GraphPage
