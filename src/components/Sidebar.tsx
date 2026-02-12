import { useMemo, useRef, useState } from 'react'
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start rounded-md"
                  style={{ paddingLeft: 8 + depth * 12 }}
                  onClick={() => onOpenFile(node.path)}
                >
                  <FileText className="h-4 w-4" />
                  <span className="truncate">{node.name}</span>
                </Button>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full justify-start rounded-md text-[11px] font-medium text-muted-foreground"
                    style={{ paddingLeft: 8 + depth * 12 }}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    <span className="truncate">{node.name}</span>
                  </Button>
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
}: SidebarProps) {
  const { t } = useI18n()
  const [filter, setFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const filteredTree = useMemo(() => filterTree(fileTree, filter), [fileTree, filter])
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
                  {filteredTree.length === 0 ? (
                    <div className="px-1 text-xs text-muted-foreground">
                      {t('sidebar.noProjectLoaded')}
                    </div>
                  ) : (
                    <FileTree
                      nodes={filteredTree}
                      onOpenFile={onOpenFile}
                      onRenamePath={onRenamePath}
                      onDeletePath={onDeletePath}
                      onCreateFile={onCreateFile}
                      onCreateFolder={onCreateFolder}
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
