import React, { useCallback } from 'react'
import { Tree, type NodeApi, type NodeRendererProps } from 'react-arborist'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import {
  ChevronRight,
  Code2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Info,
  Pencil,
  ScanSearch,
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
import { createFileTreeDragPayload, MARKO_FILE_TREE_ITEM_MIME } from '@/logic/fileDragPayload'
import type { FileTreeNode } from '@/logic/fileTree'

export type ContextLabels = {
  open: string
  openSource: string
  openGraph: string
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

type SidebarFileTreeActions = {
  activePath: string | null
  readonlyTree: boolean
  labels: ContextLabels
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: 'source' | 'graph') => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onInspectPath: (path: string) => void
}

type SidebarFileTreeProps = SidebarFileTreeActions & {
  nodes: FileTreeNode[]
  searchTerm: string
}

type FileTreeNodeRendererProps = NodeRendererProps<FileTreeNode> & SidebarFileTreeActions

const imageFilePattern = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i

const appendChildPath = (parentPath: string, name: string) =>
  [parentPath, name].filter(Boolean).join('/')

const renamePath = (path: string, nextName: string) =>
  [...path.split('/').slice(0, -1), nextName].filter(Boolean).join('/')

const FileTreeNodeRenderer = ({
  activePath,
  labels,
  node,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onRenamePath,
  readonlyTree,
  style,
}: FileTreeNodeRendererProps) => {
  const item = node.data
  const isFolder = item.type === 'folder'
  const isActive = item.type === 'file' && item.path === activePath
  const isImageFile = item.type === 'file' && imageFilePattern.test(item.name)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (isFolder) {
      node.toggle()
      return
    }
    onOpenFile(item.path)
  }

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!isImageFile) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(
      MARKO_FILE_TREE_ITEM_MIME,
      createFileTreeDragPayload({
        kind: 'file',
        name: item.name,
        path: item.path,
      }),
    )
    event.dataTransfer.setData('text/plain', item.path)
  }

  const handleCreateFile = () => {
    if (!isFolder || readonlyTree) return
    const name = window.prompt(labels.newFilePrompt, 'Untitled.md')
    if (!name) return
    onCreateFile(appendChildPath(item.path, name))
  }

  const handleCreateFolder = () => {
    if (!isFolder || readonlyTree) return
    const name = window.prompt(labels.newFolderPrompt, 'folder')
    if (!name) return
    onCreateFolder(appendChildPath(item.path, name))
  }

  const handleRename = () => {
    if (readonlyTree) return
    const nextName = window.prompt(labels.renamePrompt, item.name)
    if (!nextName) return
    onRenamePath(item.path, renamePath(item.path, nextName))
  }

  const handleDelete = () => {
    if (readonlyTree) return
    const message =
      item.type === 'folder'
        ? labels.deleteFolderConfirm.replace('{name}', item.name)
        : labels.deleteConfirm.replace('{name}', item.name)
    if (!window.confirm(message)) return
    onDeletePath(item.path)
  }

  return (
    <div className="min-w-0" style={{ ...style, boxSizing: 'border-box' }}>
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
            aria-current={isActive ? 'page' : undefined}
            draggable={isImageFile}
            onClick={handleClick}
            onDragStart={handleDragStart}
          >
            {isFolder ? (
              <>
                <ChevronRight
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                    node.isOpen ? 'rotate-90' : ''
                  }`}
                />
                {node.isOpen ? (
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
            <span className="ml-1 truncate text-left">{item.name}</span>
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
            <>
              <ContextMenuItem onSelect={() => onOpenFile(item.path)}>
                <FileText className="mr-2 h-4 w-4" />
                {labels.open}
                <span className="ml-auto text-[11px] text-muted-foreground">Enter</span>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onOpenFileView(item.path, 'source')}>
                <Code2 className="mr-2 h-4 w-4" />
                {labels.openSource}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onOpenFileView(item.path, 'graph')}>
                <ScanSearch className="mr-2 h-4 w-4" />
                {labels.openGraph}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
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
          <ContextMenuItem onSelect={() => onInspectPath(item.path)}>
            <Info className="mr-2 h-4 w-4" />
            {labels.properties}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}

export default function SidebarFileTree({
  activePath,
  labels,
  nodes,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onRenamePath,
  readonlyTree,
  searchTerm,
}: SidebarFileTreeProps) {
  const handleActivate = useCallback(
    (node: NodeApi<FileTreeNode>) => {
      if (node.data.type === 'file') {
        onOpenFile(node.data.path)
      }
    },
    [onOpenFile],
  )

  const renderNode = useCallback(
    (props: NodeRendererProps<FileTreeNode>) => (
      <FileTreeNodeRenderer
        {...props}
        activePath={activePath}
        labels={labels}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onDeletePath={onDeletePath}
        onInspectPath={onInspectPath}
        onOpenFile={onOpenFile}
        onOpenFileView={onOpenFileView}
        onRenamePath={onRenamePath}
        readonlyTree={readonlyTree}
      />
    ),
    [
      activePath,
      labels,
      onCreateFile,
      onCreateFolder,
      onDeletePath,
      onInspectPath,
      onOpenFile,
      onOpenFileView,
      onRenamePath,
      readonlyTree,
    ],
  )

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <AutoSizer
        className="h-full w-full"
        renderProp={({ height, width }) => {
          const treeHeight = height ?? 0
          const treeWidth = width ?? 0
          if (treeHeight <= 0 || treeWidth <= 0) return null

          return (
            <Tree<FileTreeNode>
              data={nodes}
              idAccessor="path"
              childrenAccessor="children"
              rowHeight={28}
              indent={13}
              overscanCount={8}
              height={treeHeight}
              width={treeWidth}
              openByDefault={false}
              selection={activePath ?? undefined}
              searchTerm={searchTerm}
              searchMatch={(treeNode, term) =>
                treeNode.data.name.toLowerCase().includes(term.toLowerCase())
              }
              disableDrag
              disableDrop
              disableEdit
              disableMultiSelection
              className="outline-none"
              onActivate={handleActivate}
            >
              {renderNode}
            </Tree>
          )
        }}
      />
    </div>
  )
}
