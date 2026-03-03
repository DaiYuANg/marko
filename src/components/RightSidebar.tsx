import { invoke, isTauri } from '@tauri-apps/api/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import {
  Code2,
  FileText,
  GitGraph,
  LayoutGrid,
  Notebook,
  NotebookTabs,
  PenLine,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createFileLabel } from '@/logic/paths'
import type { ViewMode } from '@/store/useAppStore'

type RightSidebarProps = {
  collapsed: boolean
  activePath: string | null
  inspectedPath: string | null
  tabs: string[]
  dirtyPaths: Record<string, true>
  totalFiles: number
  onOpenFile: (path: string) => void
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
}

type FsPathMetadata = {
  path: string
  absolute_path: string
  kind: string
  size_bytes: number
  modified_ms: number | null
  readonly: boolean
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function RightSidebarComponent({
  collapsed,
  activePath,
  inspectedPath,
  tabs,
  dirtyPaths,
  totalFiles,
  onOpenFile,
  viewMode,
  onChangeView,
}: RightSidebarProps) {
  const { t } = useI18n()
  const tauriAvailable = isTauri()
  const [metadata, setMetadata] = useState<FsPathMetadata | null>(null)
  const [resolvedMetadataPath, setResolvedMetadataPath] = useState<string | null>(null)
  const loadIdRef = useRef(0)
  const targetPath = inspectedPath ?? activePath
  const displayMetadata = useMemo(() => {
    if (!targetPath) return null
    if (!tauriAvailable) {
      return {
        path: targetPath,
        absolute_path: targetPath,
        kind: 'file',
        size_bytes: 0,
        modified_ms: null,
        readonly: false,
      }
    }
    if (!metadata || metadata.path !== targetPath) return null
    return metadata
  }, [metadata, targetPath, tauriAvailable])
  const loadingMetadata =
    tauriAvailable && Boolean(targetPath) && resolvedMetadataPath !== targetPath

  const quickActions = useMemo(() => {
    return [
      {
        label: t('editor.modeWysiwyg'),
        icon: PenLine,
        onClick: () => onChangeView('wysiwyg'),
      },
      {
        label: t('editor.modeSource'),
        icon: Code2,
        onClick: () => onChangeView('source'),
      },
      {
        label: t('tabs.workspaceGraph'),
        icon: GitGraph,
        onClick: () => {
          onChangeView('graph')
        },
      },
    ]
  }, [onChangeView, t])

  useEffect(() => {
    if (!targetPath || !tauriAvailable) return

    loadIdRef.current += 1
    const currentLoadId = loadIdRef.current
    void invoke<FsPathMetadata>('fs_get_path_metadata', { path: targetPath })
      .then((next) => {
        if (currentLoadId !== loadIdRef.current) return
        setMetadata(next)
        setResolvedMetadataPath(targetPath)
      })
      .catch((error) => {
        if (currentLoadId !== loadIdRef.current) return
        console.error('Failed to load metadata', error)
        setMetadata(null)
        setResolvedMetadataPath(targetPath)
      })
  }, [targetPath, tauriAvailable])

  return (
    <aside
      className={`layout-rail panel-surface panel-enter flex flex-col border-l border-border/70 bg-background/85 ${
        collapsed ? 'w-14' : 'w-72'
      }`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {!collapsed ? (
        <div className="flex h-full flex-col gap-1.5 p-1.5">
          <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/25 p-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                <div className="text-xs font-semibold">{totalFiles}</div>
              </div>
              <div className="flex items-center gap-1">
                <NotebookTabs className="h-4 w-4 text-muted-foreground" />
                <div className="text-xs font-semibold">{tabs.length}</div>
              </div>
              <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[10px]">
                {viewMode === 'graph'
                  ? t('tabs.workspaceGraph')
                  : activePath
                    ? t('inspector.currentFile')
                    : t('inspector.none')}
              </Badge>
            </div>
            <Separator className="my-1 bg-border" />
            <div className="flex gap-1">
              <TooltipProvider>
                {quickActions.map((action) => (
                  <Tooltip key={action.label}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 rounded-lg ${
                          (viewMode === 'graph' && action.icon === GitGraph) ||
                          (viewMode === 'source' && action.icon === Code2) ||
                          (viewMode === 'wysiwyg' && action.icon === PenLine)
                            ? 'bg-accent/60 text-accent-foreground'
                            : ''
                        }`}
                        onClick={action.onClick}
                        aria-label={action.label}
                      >
                        <action.icon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{action.label}</TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('inspector.properties')}
              </div>
              {loadingMetadata && (
                <Badge variant="secondary" className="text-[10px]">
                  {t('inspector.loading')}
                </Badge>
              )}
            </div>
            {!displayMetadata ? (
              <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
            ) : (
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-muted-foreground">{t('inspector.path')}</div>
                  <div className="break-all font-medium">{displayMetadata.path}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground">{t('inspector.kind')}</div>
                    <div>{displayMetadata.kind}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t('inspector.size')}</div>
                    <div>{formatBytes(displayMetadata.size_bytes)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t('inspector.modified')}</div>
                    <div>
                      {displayMetadata.modified_ms
                        ? new Date(displayMetadata.modified_ms).toLocaleString()
                        : t('inspector.unknown')}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t('inspector.readonly')}</div>
                    <div>{displayMetadata.readonly ? t('common.yes') : t('common.no')}</div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('inspector.absolutePath')}</div>
                  <div className="break-all">{displayMetadata.absolute_path}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('tabs.editor')}
            </div>
            <ScrollArea className="min-h-0 flex-1" viewportClassName="p-1">
              <div className="flex flex-col gap-1">
                {tabs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
                ) : (
                  tabs.map((tab) => (
                    <div
                      key={tab}
                      className={`flex items-center justify-between gap-2 rounded-lg border border-border/70 px-2 py-1 ${
                        tab === activePath ? 'bg-accent/40' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate text-sm" title={tab}>
                          {createFileLabel(tab)}
                        </span>
                        {dirtyPaths[tab] && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md"
                          onClick={() => onOpenFile(tab)}
                          aria-label={t('tabs.editor')}
                        >
                          <Notebook className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      ) : (
        <TooltipProvider>
          <div className="flex h-full flex-col items-center gap-2 pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('inspector.totalFiles')}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t('inspector.totalFiles')}: {totalFiles}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('inspector.openTabs')}>
                  <NotebookTabs className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t('inspector.openTabs')}: {tabs.length}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}
    </aside>
  )
}

export default memo(RightSidebarComponent)
