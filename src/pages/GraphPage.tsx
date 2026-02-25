import React, { useMemo } from 'react'
import { Background, Controls, ReactFlow } from 'reactflow'
import type { GraphData } from '@/logic/graph'
import { ExternalNode, MissingNode } from '@/components/GraphNodes'

const nodeTypes = { external: ExternalNode, missing: MissingNode }

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
        onNodeClick={(_, node) => {
          if (node.id.startsWith('file:')) {
            onOpenFile(node.id.replace('file:', ''))
          }
        }}
        fitView
      >
        <Background gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  )
}

const GraphPage = React.memo(GraphPageComponent)
export default GraphPage
