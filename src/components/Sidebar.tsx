import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileSearch, FileText, FolderOpen, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ScmPanel from '@/components/ScmPanel'
import type { FileEntry } from '@/store/useAppStore'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FileTreeNode } from '@/logic/fileTree'
import { useI18n } from '@/i18n/useI18n'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import FullTextSearchPanel from '@/components/FullTextSearchPanel'
import {
  SidebarContent as SidebarContentContainer,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import SidebarFileTree, { filterTree, flattenTree } from '@/components/SidebarFileTree'
import type { FsSearchResult } from '@/services/fsApi'

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
  rootPath: string
  onOpenGitDiff: (request: GitDiffRequest) => void
  onInspectPath: (path: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
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
  rootPath,
  onOpenGitDiff,
  onInspectPath,
  onOpenSearchResult,
}: SidebarProps) => {
  const { t } = useI18n()
  const [filter, setFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const readonlyTree = rootKind === 'single'
  const activeDirKey = useMemo(() => {
    if (!activePath) return ''
    return activePath.split('/').slice(0, -1).join('/')
  }, [activePath])
  const autoOpenDirs = useMemo(() => {
    if (!activeDirKey) return new Set<string>()
    const parts = activeDirKey.split('/')
    const next = new Set<string>()
    parts.forEach((_, index) => {
      next.add(parts.slice(0, index + 1).join('/'))
    })
    return next
  }, [activeDirKey])
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

    window.addEventListener('marko:focus-file-search', focusFilter as EventListener)
    return () => {
      window.removeEventListener('marko:focus-file-search', focusFilter as EventListener)
    }
  }, [])

  const toggleFolder = useCallback((path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])
  const focusFilterInput = useCallback(() => {
    filterInputRef.current?.focus()
    filterInputRef.current?.select()
  }, [])
  const compactFiles = useMemo(
    () => files.filter((file) => file.kind === 'file').slice(0, 8),
    [files],
  )

  return (
    <aside
      className={`layout-rail workspace-rail flex flex-col overflow-hidden border-r border-sidebar-border text-sidebar-foreground ${
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
                  className="chrome-button h-8 w-8 rounded-md"
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
                  className="chrome-button h-8 w-8 rounded-md"
                  onClick={() => {
                    focusFilterInput()
                  }}
                >
                  <FileSearch className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('sidebar.searchAction')}</TooltipContent>
            </Tooltip>
            <div className="ml-auto">
              <Button
                variant="secondary"
                size="sm"
                className="side-stat h-6 rounded px-1.5 text-[10px] shadow-none hover:cursor-pointer"
                onClick={focusFilterInput}
                aria-label={t('sidebar.searchAction')}
              >
                {fileCount}
              </Button>
            </div>
          </div>
        </TooltipProvider>
      </SidebarHeader>
      <SidebarContentContainer className="h-full p-1.5">
        {!collapsed ? (
          <div className="flex h-full min-h-0 flex-col gap-1.5">
            <SidebarGroup className="sidebar-section rounded-md p-1">
              <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
                <span>{t('sidebar.recentProjects')}</span>
                <Badge variant="secondary" className="rounded px-1.5 py-0">
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
                        className="h-7 w-full justify-start rounded-md px-2 text-sidebar-foreground/85 hover:bg-sidebar-accent"
                        onClick={() => onOpenProject(path)}
                      >
                        <FolderOpen className="h-4 w-4 text-primary" />
                        <span className="truncate text-xs">{path}</span>
                      </Button>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <ScmPanel
              collapsed={collapsed}
              rootKind={rootKind}
              rootPath={rootPath}
              onOpenDiff={onOpenGitDiff}
            />
            <SidebarGroup className="sidebar-section min-h-0 flex-1 rounded-md p-1">
              <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
                <span>{t('sidebar.files')}</span>
                <span className="text-[10px] text-muted-foreground">Ctrl+P</span>
              </SidebarGroupLabel>
              <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
                <Input
                  ref={filterInputRef}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('sidebar.search')}
                  className="h-7 rounded-md border-sidebar-border bg-background/70 text-xs shadow-sm"
                />
                <Separator className="bg-sidebar-border/70" />
                {filter.trim().length >= 2 && (
                  <>
                    <div className="min-h-[10rem]">
                      <FullTextSearchPanel query={filter} onOpenResult={onOpenSearchResult} />
                    </div>
                    <Separator className="bg-sidebar-border/70" />
                  </>
                )}
                <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pr-1">
                  {flattened.length === 0 ? (
                    <div className="px-1 text-xs text-muted-foreground">
                      {t('sidebar.noProjectLoaded')}
                    </div>
                  ) : (
                    <SidebarFileTree
                      flattened={flattened}
                      openDirs={effectiveOpenDirs}
                      activePath={activePath}
                      readonlyTree={readonlyTree}
                      labels={labels}
                      onToggleFolder={toggleFolder}
                      onOpenFile={onOpenFile}
                      onCreateFile={onCreateFile}
                      onCreateFolder={onCreateFolder}
                      onRenamePath={onRenamePath}
                      onDeletePath={onDeletePath}
                      onInspectPath={onInspectPath}
                    />
                  )}
                </ScrollArea>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col items-center gap-1 pt-1">
              <ScmPanel
                collapsed={collapsed}
                rootKind={rootKind}
                rootPath={rootPath}
                onOpenDiff={onOpenGitDiff}
              />
              {compactFiles.map((file) => {
                const isActive = file.path === activePath
                return (
                  <Tooltip key={file.path}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-8 w-8 rounded-md"
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
