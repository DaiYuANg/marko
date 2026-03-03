import { invoke, isTauri } from '@tauri-apps/api/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import { BookOpen, FileText, GitGraph, LayoutGrid, Notebook, NotebookTabs } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewMode } from '@/store/useAppStore'

type RightSidebarProps = {
  collapsed: boolean
  activePath: string | null
  inspectedPath: string | null
  tabs: string[]
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
  totalFiles,
  onOpenFile,
  viewMode,
  onChangeView,
}: RightSidebarProps) {
  const { t } = useI18n()
  const [metadata, setMetadata] = useState<FsPathMetadata | null>(null)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const loadIdRef = useRef(0)
  const targetPath = inspectedPath ?? activePath

  const quickActions = useMemo(() => {
    return [
      {
        label: t('tabs.workspaceGraph'),
        icon: GitGraph,
        onClick: () => onChangeView('graph'),
      },
      {
        label: t('tabs.editor'),
        icon: Notebook,
        onClick: () => {
          onChangeView('wysiwyg')
          if (activePath) {
            onOpenFile(activePath)
          }
        },
      },
    ]
  }, [activePath, onChangeView, onOpenFile, t])

  useEffect(() => {
    if (!targetPath) {
      setMetadata(null)
      return
    }
    if (!isTauri()) {
      setMetadata({
        path: targetPath,
        absolute_path: targetPath,
        kind: 'file',
        size_bytes: 0,
        modified_ms: null,
        readonly: false,
      })
      return
    }

    loadIdRef.current += 1
    const currentLoadId = loadIdRef.current
    setLoadingMetadata(true)
    void invoke<FsPathMetadata>('fs_get_path_metadata', { path: targetPath })
      .then((next) => {
        if (currentLoadId !== loadIdRef.current) return
        setMetadata(next)
      })
      .catch((error) => {
        if (currentLoadId !== loadIdRef.current) return
        console.error('Failed to load metadata', error)
        setMetadata(null)
      })
      .finally(() => {
        if (currentLoadId !== loadIdRef.current) return
        setLoadingMetadata(false)
      })
  }, [targetPath])

  return (
    <aside
      className={`flex flex-col border-l border-border bg-background transition-all duration-300 ${
        collapsed ? 'w-14' : 'w-80'
      }`}
    >
      {!collapsed ? (
        <div className="flex h-full flex-col gap-2 p-2">
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
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
                        className="h-8 w-8"
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

          <div className="rounded-md border border-border bg-muted/20 p-2">
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
            {!metadata ? (
              <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
            ) : (
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-muted-foreground">{t('inspector.path')}</div>
                  <div className="break-all font-medium">{metadata.path}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground">{t('inspector.kind')}</div>
                    <div>{metadata.kind}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t('inspector.size')}</div>
                    <div>{formatBytes(metadata.size_bytes)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t('inspector.modified')}</div>
                    <div>
                      {metadata.modified_ms
                        ? new Date(metadata.modified_ms).toLocaleString()
                        : t('inspector.unknown')}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t('inspector.readonly')}</div>
                    <div>{metadata.readonly ? t('common.yes') : t('common.no')}</div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('inspector.absolutePath')}</div>
                  <div className="break-all">{metadata.absolute_path}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('tabs.editor')}</div>
            <ScrollArea className="min-h-0 flex-1" viewportClassName="p-1">
              <div className="flex flex-col gap-1">
                {tabs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
                ) : (
                  tabs.map((tab) => (
                    <div
                      key={tab}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-white/5 px-2 py-1"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate text-sm">{tab}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onOpenFile(tab)}
                          aria-label={t('tabs.editor')}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onOpenFile(tab)}
                          aria-label={t('inspector.openTabs')}
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
