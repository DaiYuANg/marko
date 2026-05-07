import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import {
  Code2,
  FileText,
  GitGraph,
  LayoutGrid,
  NotebookTabs,
  PenLine,
  Link2,
  ListTree,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  createFileLabel,
  extractHeadings,
  extractLinks,
  isExternalLink,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'
import type { FileEntry, ViewMode } from '@/store/useAppStore'
import { fsApi, type FsPathMetadata } from '@/services/fsApi'
import { isTauriRuntime } from '@/utils/tauri'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'

type RightSidebarProps = {
  collapsed: boolean
  activePath: string | null
  inspectedPath: string | null
  editorValue: string
  files: FileEntry[]
  fileContents: Record<string, string>
  tabs: string[]
  totalFiles: number
  onOpenFile: (path: string) => void
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
}

const formatBytes = (size: number) => {
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

type Backlink = {
  sourcePath: string
  text: string
  context: string
  line: number
  column: number
}

const normalizeLinkedPath = (
  sourcePath: string,
  link: ReturnType<typeof extractLinks>[number],
  nameIndex: Map<string, string>,
) => {
  if (isExternalLink(link.target)) return null

  const { path: linkPath } = splitLinkTarget(link.target)
  if (link.type === 'wiki') {
    return nameIndex.get(linkPath.toLowerCase()) ?? `${linkPath}.md`
  }

  if (linkPath.trim().length === 0) {
    return sourcePath
  }

  const normalized = resolveRelativePath(sourcePath, linkPath)
  if (!normalized) return null
  return normalized.endsWith('.md') || normalized.endsWith('.markdown')
    ? normalized
    : `${normalized}.md`
}

const RightSidebarComponent = ({
  collapsed,
  activePath,
  inspectedPath,
  editorValue,
  files,
  fileContents,
  tabs,
  totalFiles,
  onOpenFile,
  viewMode,
  onChangeView,
}: RightSidebarProps) => {
  const { t } = useI18n()
  const tauriAvailable = isTauriRuntime()
  const [metadata, setMetadata] = useState<FsPathMetadata | null>(null)
  const [resolvedMetadataPath, setResolvedMetadataPath] = useState<string | null>(null)
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)
  const [pendingSourcePosition, setPendingSourcePosition] =
    useState<FocusSourcePositionRequest | null>(null)
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
  const workspaceContents = useWorkspaceMarkdownContents(files, fileContents, !collapsed)
  const targetContent = useMemo(() => {
    if (!targetPath) return ''
    if (targetPath === activePath) return editorValue
    return workspaceContents[targetPath] ?? ''
  }, [activePath, editorValue, targetPath, workspaceContents])
  const outline = useMemo(() => extractHeadings(targetContent), [targetContent])
  const backlinks = useMemo<Backlink[]>(() => {
    if (!targetPath) return []

    const nameIndex = new Map<string, string>()
    files
      .filter((file) => file.kind === 'file')
      .forEach((file) => {
        nameIndex.set(createFileLabel(file.path).toLowerCase(), file.path)
      })

    const results: Backlink[] = []
    files
      .filter((file) => file.kind === 'file' && file.path !== targetPath)
      .forEach((file) => {
        const content =
          file.path === activePath ? editorValue : (workspaceContents[file.path] ?? '')
        extractLinks(content).forEach((link) => {
          const linkedPath = normalizeLinkedPath(file.path, link, nameIndex)
          if (linkedPath !== targetPath) return
          results.push({
            sourcePath: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
          })
        })
      })
    return results
  }, [activePath, editorValue, files, targetPath, workspaceContents])

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

  const handleOpenHeading = (slug: string) => {
    if (!targetPath) return
    setPendingHeading({ path: targetPath, slug })
    if (targetPath !== activePath) {
      onOpenFile(targetPath)
    }
    if (viewMode !== 'wysiwyg') {
      onChangeView('wysiwyg')
    }
  }

  const handleOpenBacklink = (backlink: Backlink) => {
    setPendingSourcePosition({
      path: backlink.sourcePath,
      line: backlink.line,
      column: backlink.column,
    })
    if (backlink.sourcePath !== activePath) {
      onOpenFile(backlink.sourcePath)
    }
    if (viewMode !== 'source') {
      onChangeView('source')
    }
  }

  useEffect(() => {
    if (!pendingHeading) return
    if (pendingHeading.path !== activePath || viewMode !== 'wysiwyg') return

    const timer = window.setTimeout(() => {
      requestFocusHeading(pendingHeading)
      setPendingHeading((current) =>
        current?.path === pendingHeading.path && current.slug === pendingHeading.slug
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [activePath, pendingHeading, viewMode])

  useEffect(() => {
    if (!pendingSourcePosition) return
    if (pendingSourcePosition.path !== activePath || viewMode !== 'source') return

    const timer = window.setTimeout(() => {
      requestFocusSourcePosition(pendingSourcePosition)
      setPendingSourcePosition((current) =>
        current?.path === pendingSourcePosition.path &&
        current.line === pendingSourcePosition.line &&
        current.column === pendingSourcePosition.column
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [activePath, pendingSourcePosition, viewMode])

  useEffect(() => {
    if (!targetPath || !tauriAvailable) return

    loadIdRef.current += 1
    const currentLoadId = loadIdRef.current
    void fsApi
      .getPathMetadata(targetPath)
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

          <Tabs defaultValue="outline" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid h-8 w-full grid-cols-3 rounded-lg bg-muted/50 p-1">
              <TabsTrigger value="outline" className="gap-1 px-1">
                <ListTree className="h-3.5 w-3.5" />
                {t('inspector.outline')}
              </TabsTrigger>
              <TabsTrigger value="backlinks" className="gap-1 px-1">
                <Link2 className="h-3.5 w-3.5" />
                {t('inspector.backlinks')}
              </TabsTrigger>
              <TabsTrigger value="properties" className="gap-1 px-1">
                <FileText className="h-3.5 w-3.5" />
                {t('inspector.properties')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="outline" className="mt-1.5 min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName="p-1">
                {!targetPath ? (
                  <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
                ) : outline.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t('inspector.noOutline')}</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {outline.map((heading) => (
                      <Button
                        key={`${heading.slug}-${heading.level}`}
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start rounded-lg px-2 text-xs"
                        style={{ paddingLeft: 6 + (heading.level - 1) * 12 }}
                        onClick={() => handleOpenHeading(heading.slug)}
                      >
                        <Badge
                          variant="secondary"
                          className="mr-2 rounded-md px-1 py-0 text-[10px]"
                        >
                          H{heading.level}
                        </Badge>
                        <span className="truncate">{heading.text}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="backlinks" className="mt-1.5 min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName="p-1">
                {!targetPath ? (
                  <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
                ) : backlinks.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t('inspector.noBacklinks')}</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {backlinks.map((backlink, index) => (
                      <Button
                        key={`${backlink.sourcePath}-${index}`}
                        variant="ghost"
                        size="sm"
                        className="h-auto min-h-9 w-full justify-start rounded-lg px-2 py-1 text-left"
                        onClick={() => handleOpenBacklink(backlink)}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {createFileLabel(backlink.sourcePath)}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {backlink.text}
                          </span>
                          {backlink.context && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                              {backlink.context}
                            </span>
                          )}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="properties" className="mt-1.5 min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName="p-2">
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
              </ScrollArea>
            </TabsContent>
          </Tabs>
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
