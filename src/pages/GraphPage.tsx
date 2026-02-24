import { Background, Controls, ReactFlow } from 'reactflow'
import type { GraphData } from '@/logic/graph'
import { ExternalNode, MissingNode } from '@/components/GraphNodes'

const nodeTypes = { external: ExternalNode, missing: MissingNode }

type GraphPageProps = {
  graph: GraphData
  onOpenFile: (path: string) => void
}

const GraphPage = ({ graph, onOpenFile }: GraphPageProps) => (
  <div className="h-full">
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
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
export default GraphPage
