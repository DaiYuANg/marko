import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, FolderPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import SidebarFileTree, { filterTree, flattenTree } from '@/components/SidebarFileTree'
import type { SidebarExplorerPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'

const createRootEntry = (promptLabel: string, action: (path: string) => void) => {
  const value = window.prompt(promptLabel)
  const path = value?.trim()
  if (!path) return
  action(path)
}

export default function SidebarExplorerPanel({
  activePath,
  fileCount,
  fileTree,
  focusFileFilterRequest,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onRenamePath,
  rootKind,
}: SidebarExplorerPanelProps) {
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
  const labels = useMemo(
    () => ({
      open: t('context.open'),
      openSource: t('context.openSource'),
      openGraph: t('context.openGraph'),
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
    if (focusFileFilterRequest === 0) return
    filterInputRef.current?.focus()
    filterInputRef.current?.select()
  }, [focusFileFilterRequest])

  const toggleFolder = useCallback((path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <SidebarGroup className="sidebar-section min-h-0 flex-1 rounded-md p-1">
        <SidebarGroupLabel className="sidebar-section-header flex h-8 items-center justify-between px-2 text-[11px] uppercase">
          <span>{t('sidebar.files')}</span>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="rounded px-1.5 py-0">
              {fileCount}
            </Badge>
            {!readonlyTree && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md"
                  aria-label={t('sidebar.newFile')}
                  onClick={() => createRootEntry(labels.newFilePrompt, onCreateFile)}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md"
                  aria-label={t('sidebar.newFolder')}
                  onClick={() => createRootEntry(labels.newFolderPrompt, onCreateFolder)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
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
                onOpenFileView={onOpenFileView}
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
  )
}
