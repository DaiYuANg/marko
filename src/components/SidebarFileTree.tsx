import React from 'react'
import { List } from 'react-window'
import {
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Info,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { FileTreeNode } from '@/logic/fileTree'

export type ContextLabels = {
  open: string
  newFile: string
  newFolder: string
  rename: string
  delete: string
  properties: string
  newFilePrompt: string
  newFolderPrompt: string
  renamePrompt: string
  deleteConfirm: string
  deleteFolderConfirm: string
}

type FlatTreeNode = {
  node: FileTreeNode
  depth: number
}

export const filterTree = (nodes: FileTreeNode[], query: string): FileTreeNode[] => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return nodes

  return nodes
    .map((node) => {
      const matched = node.name.toLowerCase().includes(normalized)
      if (node.type === 'file') {
        return matched ? node : null
      }
      const children = node.children ? filterTree(node.children, normalized) : []
      if (matched || children.length > 0) {
        return { ...node, children }
      }
      return null
    })
    .filter((node): node is FileTreeNode => node !== null)
}

export const flattenTree = (
  nodes: FileTreeNode[],
  depth: number,
  openDirs: Set<string>,
): FlatTreeNode[] => {
  const result: FlatTreeNode[] = []
  nodes.forEach((node) => {
    result.push({ node, depth })
    if (node.type === 'folder' && node.children && openDirs.has(node.path)) {
      result.push(...flattenTree(node.children, depth + 1, openDirs))
    }
  })
  return result
}

type SidebarFileTreeProps = {
  flattened: FlatTreeNode[]
  openDirs: Set<string>
  activePath: string | null
  readonlyTree: boolean
  labels: ContextLabels
  onToggleFolder: (path: string) => void
  onOpenFile: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onInspectPath: (path: string) => void
}

const TreeRowComponent = ({
  index,
  style,
  ariaAttributes,
  flattened,
  openDirs,
  activePath,
  readonlyTree,
  labels,
  onToggleFolder,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onInspectPath,
}: {
  index: number
  style: React.CSSProperties
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
} & SidebarFileTreeProps) => {
  const { node, depth } = flattened[index]
  const isFolder = node.type === 'folder'
  const isOpen = isFolder && openDirs.has(node.path)
  const isActive = node.type === 'file' && node.path === activePath
  const paddingLeft = 10 + depth * 13

  const handleCreateFile = () => {
    if (!isFolder || readonlyTree) return
    const name = window.prompt(labels.newFilePrompt, 'Untitled.md')
    if (!name) return
    onCreateFile(`${node.path}/${name}`)
  }

  const handleCreateFolder = () => {
    if (!isFolder || readonlyTree) return
    const name = window.prompt(labels.newFolderPrompt, 'folder')
    if (!name) return
    onCreateFolder(`${node.path}/${name}`)
  }

  const handleRename = () => {
    if (readonlyTree) return
    const nextName = window.prompt(labels.renamePrompt, node.name)
    if (!nextName) return
    const parent = node.path.split('/').slice(0, -1)
    const nextPath = [...parent, nextName].filter(Boolean).join('/')
    onRenamePath(node.path, nextPath)
  }

  const handleDelete = () => {
    if (readonlyTree) return
    const message =
      node.type === 'folder'
        ? labels.deleteFolderConfirm.replace('{name}', node.name)
        : labels.deleteConfirm.replace('{name}', node.name)
    if (!window.confirm(message)) return
    onDeletePath(node.path)
  }

  return (
    <div style={style} key={node.path} {...ariaAttributes}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`group relative h-[28px] w-full justify-start rounded-md px-2 text-xs transition-all ${
              isActive
                ? 'bg-accent text-accent-foreground before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-full before:bg-primary'
                : 'text-sidebar-foreground/85 hover:bg-sidebar-accent'
            }`}
            style={{ paddingLeft }}
            onClick={() => {
              if (isFolder) {
                onToggleFolder(node.path)
                return
              }
              onOpenFile(node.path)
            }}
          >
            {isFolder ? (
              <>
                <ChevronRight
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                />
                {isOpen ? (
                  <FolderOpen className="h-4 w-4 text-primary" />
                ) : (
                  <Folder className="h-4 w-4 text-muted-foreground" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5" />
                <FileText className="h-4 w-4 text-muted-foreground" />
              </>
            )}
            <span className="ml-1 truncate text-left">{node.name}</span>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-[12.5rem] rounded-md border border-border bg-popover p-1 shadow-lg">
          {isFolder ? (
            <>
              {!readonlyTree && (
                <>
                  <ContextMenuItem onSelect={handleCreateFile}>
                    <FilePlus2 className="mr-2 h-4 w-4" />
                    {labels.newFile}
                    <span className="ml-auto text-[11px] text-muted-foreground">N</span>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={handleCreateFolder}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    {labels.newFolder}
                    <span className="ml-auto text-[11px] text-muted-foreground">Shift+N</span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
            </>
          ) : (
            <ContextMenuItem onSelect={() => onOpenFile(node.path)}>
              <FileText className="mr-2 h-4 w-4" />
              {labels.open}
              <span className="ml-auto text-[11px] text-muted-foreground">Enter</span>
            </ContextMenuItem>
          )}
          {!readonlyTree && (
            <>
              <ContextMenuItem onSelect={handleRename}>
                <Pencil className="mr-2 h-4 w-4" />
                {labels.rename}
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {labels.delete}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={() => onInspectPath(node.path)}>
            <Info className="mr-2 h-4 w-4" />
            {labels.properties}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}

const MemoTreeRow = React.memo(TreeRowComponent, (prev, next) => {
  const prevItem = prev.flattened[prev.index]
  const nextItem = next.flattened[next.index]
  if (prevItem?.node.path !== nextItem?.node.path) return false
  if (prevItem?.depth !== nextItem?.depth) return false
  if (prev.style !== next.style) return false
  if (prev.readonlyTree !== next.readonlyTree) return false
  if (prev.labels !== next.labels) return false

  const path = nextItem.node.path
  const wasActive = prev.activePath === path
  const isActive = next.activePath === path
  if (wasActive !== isActive) return false

  const wasOpen = prev.openDirs.has(path)
  const isOpen = next.openDirs.has(path)
  return wasOpen === isOpen
})

const TreeRow = (
  props: {
    index: number
    style: React.CSSProperties
    ariaAttributes: {
      'aria-posinset': number
      'aria-setsize': number
      role: 'listitem'
    }
  } & SidebarFileTreeProps,
) => <MemoTreeRow {...props} />

export default function SidebarFileTree(props: SidebarFileTreeProps) {
  return (
    <List
      className="h-full w-full"
      style={{ height: '100%' }}
      rowCount={props.flattened.length}
      rowHeight={28}
      overscanCount={8}
      rowProps={props}
      rowComponent={TreeRow}
    />
  )
}
