import { FolderOpen, FileText } from 'lucide-react'
import type { MarkdownFile } from '@/store/useAppStore'
import type { FileTreeNode } from '@/logic/fileTree'

type SidebarProps = {
  collapsed: boolean
  recentProjects: string[]
  files: MarkdownFile[]
  fileTree: FileTreeNode[]
  onOpenFile: (path: string) => void
  onOpenProject: (path: string) => void
}

function FileTree({
  nodes,
  onOpenFile,
  depth = 0,
}: {
  nodes: FileTreeNode[]
  onOpenFile: (path: string) => void
  depth?: number
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === 'file' ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => onOpenFile(node.path)}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{node.name}</span>
            </button>
          ) : (
            <div className="space-y-1">
              <div
                className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground"
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {node.name}
              </div>
              {node.children && (
                <FileTree nodes={node.children} onOpenFile={onOpenFile} depth={depth + 1} />
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function Sidebar({
  collapsed,
  recentProjects,
  files,
  fileTree,
  onOpenFile,
  onOpenProject,
}: SidebarProps) {
  return (
    <aside
      className={`flex flex-col border-r border-border bg-white/70 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="flex h-full flex-col gap-4 p-3">
        <div>
          {!collapsed && (
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">最近项目</div>
          )}
          <div className="space-y-1">
            {recentProjects.length === 0 && !collapsed && (
              <div className="text-xs text-muted-foreground">暂无项目</div>
            )}
            {recentProjects.map((path) => (
              <button
                key={path}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-muted"
                onClick={() => onOpenProject(path)}
              >
                <FolderOpen className="h-4 w-4" />
                {!collapsed && <span className="truncate">{path}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!collapsed && (
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">文件</div>
          )}
          {fileTree.length === 0 && !collapsed && (
            <div className="text-xs text-muted-foreground">尚未载入项目</div>
          )}
          {fileTree.length > 0 && !collapsed && (
            <FileTree nodes={fileTree} onOpenFile={onOpenFile} />
          )}
          {fileTree.length > 0 && collapsed && (
            <div className="flex flex-col items-center gap-2">
              {files.map((file) => (
                <button
                  key={file.relative_path}
                  type="button"
                  className="rounded-lg p-2 hover:bg-muted"
                  onClick={() => onOpenFile(file.relative_path)}
                >
                  <FileText className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
