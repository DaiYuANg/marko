import React, { useEffect, useMemo, useRef, useState } from 'react'
import { List } from 'react-window'
import {
  ChevronRight,
  FilePlus2,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Info,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FileEntry } from '@/store/useAppStore'
import type { FileTreeNode } from '@/logic/fileTree'
import { useI18n } from '@/i18n/useI18n'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SidebarContent as SidebarContentContainer,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
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
  activePath: string | null
  onOpenFile: (path: string) => void
  onOpenProject: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onUseInternalRoot: () => void
  rootKind: 'internal' | 'external' | 'single'
  onInspectPath: (path: string) => void
}

type FlatTreeNode = {
  node: FileTreeNode
  depth: number
}

type ContextLabels = {
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

function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
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

function flattenTree(nodes: FileTreeNode[], depth: number, openDirs: Set<string>): FlatTreeNode[] {
  const result: FlatTreeNode[] = []
  nodes.forEach((node) => {
    result.push({ node, depth })
    if (node.type === 'folder' && node.children && openDirs.has(node.path)) {
      result.push(...flattenTree(node.children, depth + 1, openDirs))
    }
  })
  return result
}

type TreeRowProps = {
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

function TreeRow({
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
} & TreeRowProps) {
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
            className={`group h-[30px] w-full justify-start rounded-lg px-2 text-xs transition-all ${
              isActive ? 'bg-accent/70 text-accent-foreground shadow-sm' : 'hover:bg-muted/70'
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
                  <FolderOpen className="h-4 w-4 text-sky-500" />
                ) : (
                  <Folder className="h-4 w-4" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5" />
                <FileText className="h-4 w-4" />
              </>
            )}
            <span className="ml-1 truncate text-left">{node.name}</span>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-[12.5rem] rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur">
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

const SidebarComponent = ({
  collapsed,
  recentProjects,
  files,
  fileTree,
  activePath,
  onOpenFile,
  onOpenProject,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onUseInternalRoot,
  rootKind,
  onInspectPath,
}: SidebarProps) => {
  const { t } = useI18n()
  const [filter, setFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const readonlyTree = rootKind === 'single'
  const autoOpenDirs = useMemo(() => {
    if (!activePath) return new Set<string>()
    const parts = activePath.split('/')
    if (parts.length <= 1) return new Set<string>()
    const next = new Set<string>()
    parts.slice(0, -1).forEach((_, index) => {
      next.add(parts.slice(0, index + 1).join('/'))
    })
    return next
  }, [activePath])
  const effectiveOpenDirs = useMemo(() => {
    if (autoOpenDirs.size === 0) return openDirs
    const next = new Set(openDirs)
    autoOpenDirs.forEach((path) => next.add(path))
    return next
  }, [autoOpenDirs, openDirs])

  const filteredTree = useMemo(() => filterTree(fileTree, filter), [fileTree, filter])
  const flattened = useMemo(
    () => flattenTree(filteredTree, 0, effectiveOpenDirs),
    [effectiveOpenDirs, filteredTree],
  )
  const fileCount = useMemo(() => files.filter((entry) => entry.kind === 'file').length, [files])
  const labels = useMemo(
    () => ({
      open: t('context.open'),
      newFile: t('context.newFile'),
      newFolder: t('context.newFolder'),
      rename: t('context.rename'),
      delete: t('context.delete'),
      properties: t('context.properties'),
      newFilePrompt: t('context.newFilePrompt'),
      newFolderPrompt: t('context.newFolderPrompt'),
      renamePrompt: t('context.renamePrompt'),
      deleteConfirm: t('context.deleteConfirm', { name: '{name}' }),
      deleteFolderConfirm: t('context.deleteFolderConfirm', { name: '{name}' }),
    }),
    [t],
  )

  useEffect(() => {
    const focusFilter = () => {
      filterInputRef.current?.focus()
      filterInputRef.current?.select()
    }

    const onHotkey = (event: KeyboardEvent) => {
      const withCommand = event.ctrlKey || event.metaKey
      if (!withCommand || event.key.toLowerCase() !== 'p') return
      event.preventDefault()
      focusFilter()
    }

    window.addEventListener('marko:focus-file-search', focusFilter as EventListener)
    window.addEventListener('keydown', onHotkey)
    return () => {
      window.removeEventListener('marko:focus-file-search', focusFilter as EventListener)
      window.removeEventListener('keydown', onHotkey)
    }
  }, [])

  const toggleFolder = (path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <aside
      className={`layout-rail panel-surface panel-enter flex flex-col overflow-hidden border-r border-border/70 text-sidebar-foreground ${
        collapsed ? 'w-14' : 'w-[18rem]'
      }`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <SidebarHeader className="border-b border-sidebar-border/80 px-1.5 py-1.5">
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={onUseInternalRoot}
                >
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('sidebar.localWorkspace')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => {
                    filterInputRef.current?.focus()
                    filterInputRef.current?.select()
                  }}
                >
                  <FileSearch className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('sidebar.searchAction')}</TooltipContent>
            </Tooltip>
            <div className="ml-auto">
              <Badge variant="secondary" className="rounded-md px-1.5 text-[10px]">
                {fileCount}
              </Badge>
            </div>
          </div>
        </TooltipProvider>
      </SidebarHeader>
      <SidebarContentContainer className="h-full p-1.5">
        {!collapsed ? (
          <>
            <SidebarGroup className="rounded-xl border border-sidebar-border/60 bg-sidebar-accent/20">
              <SidebarGroupLabel className="flex items-center justify-between text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                <span>{t('sidebar.recentProjects')}</span>
                <Badge variant="secondary" className="px-1.5 py-0">
                  {recentProjects.length}
                </Badge>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recentProjects.length === 0 && (
                    <SidebarMenuItem>
                      <div className="px-1 text-xs text-muted-foreground">
                        {t('sidebar.noRecentProjects')}
                      </div>
                    </SidebarMenuItem>
                  )}
                  {recentProjects.slice(0, 4).map((path) => (
                    <SidebarMenuItem key={path}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start rounded-lg px-2 hover:bg-sidebar-accent"
                        onClick={() => onOpenProject(path)}
                      >
                        <FolderOpen className="h-4 w-4 text-sky-500" />
                        <span className="truncate text-xs">{path}</span>
                      </Button>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup className="mt-1.5 min-h-0 flex-1 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/10">
              <SidebarGroupLabel className="flex items-center justify-between text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                <span>{t('sidebar.files')}</span>
                <span className="text-[10px] text-muted-foreground">Ctrl+P</span>
              </SidebarGroupLabel>
              <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
                <Input
                  ref={filterInputRef}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('sidebar.search')}
                  className="h-7 rounded-lg border-border/70 bg-sidebar text-xs"
                />
                <Separator className="bg-sidebar-border/70" />
                <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pr-1">
                  {flattened.length === 0 ? (
                    <div className="px-1 text-xs text-muted-foreground">
                      {t('sidebar.noProjectLoaded')}
                    </div>
                  ) : (
                    <List
                      className="h-full w-full"
                      style={{ height: '100%' }}
                      rowCount={flattened.length}
                      rowHeight={30}
                      overscanCount={8}
                      rowProps={{
                        flattened,
                        openDirs: effectiveOpenDirs,
                        activePath,
                        readonlyTree,
                        labels,
                        onToggleFolder: toggleFolder,
                        onOpenFile,
                        onCreateFile,
                        onCreateFolder,
                        onRenamePath,
                        onDeletePath,
                        onInspectPath,
                      }}
                      rowComponent={TreeRow}
                    />
                  )}
                </ScrollArea>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col items-center gap-1 pt-1">
              {files
                .filter((file) => file.kind === 'file')
                .slice(0, 8)
                .map((file) => {
                  const isActive = file.path === activePath
                  return (
                    <Tooltip key={file.path}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isActive ? 'secondary' : 'ghost'}
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => onOpenFile(file.path)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{file.path}</TooltipContent>
                    </Tooltip>
                  )
                })}
            </div>
          </TooltipProvider>
        )}
      </SidebarContentContainer>
    </aside>
  )
}

export default React.memo(SidebarComponent)
