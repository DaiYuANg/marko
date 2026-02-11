import { FilePlus, FileText, FolderOpen, FolderPlus, Home, RefreshCw } from 'lucide-react'
import type { FileEntry } from '@/store/useAppStore'
import type { FileTreeNode } from '@/logic/fileTree'
import { useI18n } from '@/i18n/useI18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

type SidebarProps = {
  collapsed: boolean
  recentProjects: string[]
  files: FileEntry[]
  fileTree: FileTreeNode[]
  onOpenFile: (path: string) => void
  onOpenProject: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onUseInternalRoot: () => void
  onRefresh: () => void
}

function FileTree({
  nodes,
  onOpenFile,
  onRenamePath,
  onDeletePath,
  onCreateFile,
  onCreateFolder,
  depth = 0,
}: {
  nodes: FileTreeNode[]
  onOpenFile: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  depth?: number
}) {
  const { t } = useI18n()

  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === 'file' ? (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
                  style={{ paddingLeft: 8 + depth * 12 }}
                  onClick={() => onOpenFile(node.path)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{node.name}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onOpenFile(node.path)}>
                  {t('context.open')}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    const next = window.prompt(t('context.renamePrompt'), node.name)
                    if (!next) return
                    const nextPath = node.path.split('/').slice(0, -1).concat(next).join('/')
                    onRenamePath(node.path, nextPath)
                  }}
                >
                  {t('context.rename')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => {
                    if (window.confirm(t('context.deleteConfirm', { name: node.name }))) {
                      onDeletePath(node.path)
                    }
                  }}
                >
                  {t('context.delete')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ) : (
            <div className="space-y-1">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground"
                    style={{ paddingLeft: 8 + depth * 12 }}
                  >
                    <span className="truncate">{node.name}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() => {
                      const name = window.prompt(t('context.newFilePrompt'), 'Untitled.md')
                      if (!name) return
                      const target = `${node.path}/${name}`
                      onCreateFile(target)
                    }}
                  >
                    {t('context.newFile')}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      const name = window.prompt(t('context.newFolderPrompt'), 'folder')
                      if (!name) return
                      const target = `${node.path}/${name}`
                      onCreateFolder(target)
                    }}
                  >
                    {t('context.newFolder')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      const next = window.prompt(t('context.renamePrompt'), node.name)
                      if (!next) return
                      const nextPath = node.path.split('/').slice(0, -1).concat(next).join('/')
                      onRenamePath(node.path, nextPath)
                    }}
                  >
                    {t('context.rename')}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      if (window.confirm(t('context.deleteFolderConfirm', { name: node.name }))) {
                        onDeletePath(node.path)
                      }
                    }}
                  >
                    {t('context.delete')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              {node.children && (
                <FileTree
                  nodes={node.children}
                  onOpenFile={onOpenFile}
                  onRenamePath={onRenamePath}
                  onDeletePath={onDeletePath}
                  onCreateFile={onCreateFile}
                  onCreateFolder={onCreateFolder}
                  depth={depth + 1}
                />
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
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onUseInternalRoot,
  onRefresh,
}: SidebarProps) {
  const { t } = useI18n()

  return (
    <aside
      className={`flex flex-col border-r border-border bg-white/70 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="flex h-full flex-col gap-4 p-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1 text-xs hover:bg-muted"
              onClick={() => {
                const name = window.prompt('New file name:', 'Untitled.md')
                if (!name) return
                onCreateFile(name)
              }}
            >
              <FilePlus className="h-3.5 w-3.5" />
              {t('sidebar.newFile')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1 text-xs hover:bg-muted"
              onClick={() => {
                const name = window.prompt('New folder name:', 'folder')
                if (!name) return
                onCreateFolder(name)
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t('sidebar.newFolder')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1 text-xs hover:bg-muted"
              onClick={onRefresh}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('sidebar.refresh')}
            </button>
            <button
              type="button"
              className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1 text-xs hover:bg-muted"
              onClick={onUseInternalRoot}
            >
              <Home className="h-3.5 w-3.5" />
              {t('sidebar.localWorkspace')}
            </button>
          </div>
        )}
        <div>
          {!collapsed && (
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t('sidebar.recentProjects')}
            </div>
          )}
          <div className="space-y-1">
            {recentProjects.length === 0 && !collapsed && (
              <div className="text-xs text-muted-foreground">{t('sidebar.noRecentProjects')}</div>
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
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t('sidebar.files')}
            </div>
          )}
          {fileTree.length === 0 && !collapsed && (
            <div className="text-xs text-muted-foreground">{t('sidebar.noProjectLoaded')}</div>
          )}
          {fileTree.length > 0 && !collapsed && (
            <FileTree
              nodes={fileTree}
              onOpenFile={onOpenFile}
              onRenamePath={onRenamePath}
              onDeletePath={onDeletePath}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
            />
          )}
          {fileTree.length > 0 && collapsed && (
            <div className="flex flex-col items-center gap-2">
              {files
                .filter((file) => file.kind === 'file')
                .map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="rounded-lg p-2 hover:bg-muted"
                    onClick={() => onOpenFile(file.path)}
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
