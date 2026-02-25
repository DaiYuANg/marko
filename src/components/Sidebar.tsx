import React, { useMemo, useRef, useState } from 'react'
// react-window exports are sometimes tricky under pnpm/Esm
// use a namespace import and pull out FixedSizeList by name at runtime
import * as RW from 'react-window'
// react-window exports `List` as the virtualized list component (not FixedSizeList)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const List = (RW as any).List as React.ComponentType<any>
if (!List) {
  console.error('react-window List import failed, namespace:', RW)
}
import { FileSearch, FileText, Folder, FolderOpen, Home, Sparkles } from 'lucide-react'
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
  SidebarHeader,
  SidebarContent as SidebarContentContainer,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  onOpenFile: (path: string) => void
  onOpenProject: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onUseInternalRoot: () => void
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

// produce a flat list from nested tree for virtualization, respecting
// which directories are currently expanded. callers supply a set of open
// folder paths; only children of those paths are included.
function flattenTree(
  nodes: FileTreeNode[],
  depth = 0,
  openDirs: Set<string>,
): Array<{ node: FileTreeNode; depth: number }> {
  const result: Array<{ node: FileTreeNode; depth: number }> = []
  nodes.forEach((n) => {
    result.push({ node: n, depth })
    if (n.type === 'folder' && n.children && openDirs.has(n.path)) {
      result.push(...flattenTree(n.children, depth + 1, openDirs))
    }
  })
  return result
}

const SidebarComponent = ({
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
}: SidebarProps) => {
  const { t } = useI18n()
  const [filter, setFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const filteredTree = useMemo(() => filterTree(fileTree, filter), [fileTree, filter])
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const flattened = useMemo(() => flattenTree(filteredTree, 0, openDirs), [filteredTree, openDirs])
  const fileCount = useMemo(() => files.filter((entry) => entry.kind === 'file').length, [files])

  return (
    <aside
      className={`flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${
        collapsed ? 'w-14' : 'w-72'
      }`}
    >
      <SidebarHeader className="border-b border-sidebar-border px-2 py-2">
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUseInternalRoot}>
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
                  className="h-8 w-8"
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.alert(t('sidebar.askAiSoon'))}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('sidebar.askAi')}</TooltipContent>
            </Tooltip>
            <div className="ml-auto">
              <Badge variant="secondary" className="rounded-md px-1.5 text-[10px]">
                {fileCount}
              </Badge>
            </div>
          </div>
        </TooltipProvider>
      </SidebarHeader>
      <SidebarContentContainer className="h-full p-2">
        {!collapsed ? (
          <>
            <SidebarGroup className="rounded-md bg-sidebar-accent/20">
              <SidebarGroupLabel className="flex items-center justify-between text-xs uppercase tracking-wide text-sidebar-foreground/70">
                <span>{t('sidebar.recentProjects')}</span>
                <Badge variant="secondary">{recentProjects.length}</Badge>
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
                  {recentProjects.map((path) => (
                    <SidebarMenuItem key={path}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        onClick={() => onOpenProject(path)}
                      >
                        <FolderOpen className="h-4 w-4" />
                        <span className="truncate">{path}</span>
                      </Button>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup className="min-h-0 flex-1 rounded-md bg-sidebar-accent/10">
              <SidebarGroupLabel className="flex items-center justify-between text-xs uppercase tracking-wide text-sidebar-foreground/70">
                <span>{t('sidebar.files')}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
                <Input
                  ref={filterInputRef}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('sidebar.search')}
                  className="bg-sidebar"
                />
                <Separator className="bg-sidebar-border/70" />
                <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
                  {flattened.length === 0 ? (
                    <div className="px-1 text-xs text-muted-foreground">
                      {t('sidebar.noProjectLoaded')}
                    </div>
                  ) : (
                    <List
                      height="100%"
                      width="100%"
                      rowCount={flattened.length}
                      rowHeight={28}
                      rowProps={{}}
                      rowComponent={({
                        index,
                        style,
                      }: {
                        index: number
                        style: React.CSSProperties
                      }) => {
                        const { node, depth } = flattened[index]
                        const isFolder = node.type === 'folder'
                        const padding = 8 + depth * 12
                        const isOpen = isFolder && openDirs.has(node.path)
                        return (
                          <div style={style} key={node.path}>
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-full justify-start rounded-md"
                                  style={{ paddingLeft: padding }}
                                  onClick={() => {
                                    if (isFolder) {
                                      setOpenDirs((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(node.path)) next.delete(node.path)
                                        else next.add(node.path)
                                        return next
                                      })
                                    } else {
                                      onOpenFile(node.path)
                                    }
                                  }}
                                >
                                  {isFolder ? (
                                    isOpen ? (
                                      <FolderOpen className="h-4 w-4" />
                                    ) : (
                                      <Folder className="h-4 w-4" />
                                    )
                                  ) : (
                                    <FileText className="h-4 w-4" />
                                  )}
                                  <span className="truncate ml-1">{node.name}</span>
                                </Button>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                {isFolder ? (
                                  <>
                                    <ContextMenuItem
                                      onSelect={() => {
                                        const name = window.prompt(
                                          t('context.newFilePrompt'),
                                          'Untitled.md',
                                        )
                                        if (!name) return
                                        const target = `${node.path}/${name}`
                                        onCreateFile(target)
                                      }}
                                    >
                                      {t('context.newFile')}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      onSelect={() => {
                                        const name = window.prompt(
                                          t('context.newFolderPrompt'),
                                          'folder',
                                        )
                                        if (!name) return
                                        const target = `${node.path}/${name}`
                                        onCreateFolder(target)
                                      }}
                                    >
                                      {t('context.newFolder')}
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                  </>
                                ) : (
                                  <ContextMenuItem onSelect={() => onOpenFile(node.path)}>
                                    {t('context.open')}
                                  </ContextMenuItem>
                                )}
                                <ContextMenuItem
                                  onSelect={() => {
                                    const next = window.prompt(t('context.renamePrompt'), node.name)
                                    if (!next) return
                                    const nextPath = node.path
                                      .split('/')
                                      .slice(0, -1)
                                      .concat(next)
                                      .join('/')
                                    onRenamePath(node.path, nextPath)
                                  }}
                                >
                                  {t('context.rename')}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onSelect={() => {
                                    const msg = isFolder
                                      ? t('context.deleteFolderConfirm', { name: node.name })
                                      : t('context.deleteConfirm', { name: node.name })
                                    if (window.confirm(msg)) {
                                      onDeletePath(node.path)
                                    }
                                  }}
                                >
                                  {t('context.delete')}
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          </div>
                        )
                      }}
                    />
                  )}
                </ScrollArea>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col items-center gap-1 pt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onUseInternalRoot}
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('sidebar.localWorkspace')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      filterInputRef.current?.focus()
                      filterInputRef.current?.select()
                    }}
                  >
                    <FileSearch className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('sidebar.searchAction')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.alert(t('sidebar.askAiSoon'))}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('sidebar.askAi')}</TooltipContent>
              </Tooltip>
              <Separator className="my-1 w-8 bg-sidebar-border" />
              {files
                .filter((file) => file.kind === 'file')
                .map((file) => (
                  <Tooltip key={file.path}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onOpenFile(file.path)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{file.path}</TooltipContent>
                  </Tooltip>
                ))}
            </div>
          </TooltipProvider>
        )}
      </SidebarContentContainer>
    </aside>
  )
}

export default React.memo(SidebarComponent)
