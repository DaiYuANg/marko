import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Code2,
  FileText,
  GitGraph,
  Hash,
  LayoutGrid,
  NotebookTabs,
  PenLine,
  Link2,
  ListTree,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  createFileLabel,
  extractHeadings,
  extractLinks,
  isExternalLink,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'
import type { FileEntry, ViewMode } from '@/store/useAppStore'
import { fsApi, type FsPathMetadata, type FsWorkspaceIndex } from '@/services/fsApi'
import { isTauriRuntime } from '@/utils/tauri'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import {
  getMarkdownSourceDiagnostics,
  type MarkdownSourceDiagnostic,
} from '@/logic/markdownDiagnostics'

type RightSidebarProps = {
  collapsed: boolean
  activePath: string | null
  inspectedPath: string | null
  editorValue: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
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

const problemIcon = (severity: MarkdownSourceDiagnostic['severity']) => {
  return severity === 'error' ? CircleX : CircleAlert
}

const problemClasses = (severity: MarkdownSourceDiagnostic['severity']) => {
  return severity === 'error' ? 'text-destructive' : 'text-amber-500'
}

const getDocumentStats = (value: string) => {
  const trimmed = value.trim()
  return {
    lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length,
  }
}

const RightSidebarComponent = ({
  collapsed,
  activePath,
  inspectedPath,
  editorValue,
  files,
  fileContents,
  workspaceIndex,
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
  const indexedFilesByPath = useMemo(() => {
    if (!workspaceIndex) return null
    return new Map(workspaceIndex.files.map((file) => [file.path, file]))
  }, [workspaceIndex])
  const indexedTargetFile = targetPath ? indexedFilesByPath?.get(targetPath) : undefined
  const workspaceContents = useWorkspaceMarkdownContents(
    files,
    fileContents,
    !collapsed && !workspaceIndex,
  )
  const targetContent = useMemo(() => {
    if (!targetPath) return ''
    if (targetPath === activePath) return editorValue
    return workspaceContents[targetPath] ?? ''
  }, [activePath, editorValue, targetPath, workspaceContents])
  const outline = useMemo(() => {
    if (targetPath && targetPath !== activePath && indexedTargetFile) {
      return indexedTargetFile.headings
    }
    return extractHeadings(targetContent)
  }, [activePath, indexedTargetFile, targetContent, targetPath])
  const backlinks = useMemo<Backlink[]>(() => {
    if (!targetPath) return []

    if (workspaceIndex) {
      return workspaceIndex.files.flatMap((file) => {
        if (file.path === targetPath) return []
        return file.links
          .filter((link) => !link.is_external && link.target_path === targetPath)
          .map((link) => ({
            sourcePath: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
          }))
      })
    }

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
  }, [activePath, editorValue, files, targetPath, workspaceContents, workspaceIndex])
  const problems = useMemo(() => {
    return getMarkdownSourceDiagnostics({
      activePath: targetPath,
      content: targetContent,
      files,
      fileContents: workspaceContents,
      workspaceIndex,
    })
  }, [files, workspaceIndex, targetPath, targetContent, workspaceContents])
  const documentStats = useMemo(() => getDocumentStats(targetContent), [targetContent])
  const outgoingLinkCount = useMemo(() => {
    if (!targetPath) return 0
    if (targetPath !== activePath && indexedTargetFile) {
      return indexedTargetFile.links.filter((link) => !link.is_external).length
    }
    return extractLinks(targetContent).filter((link) => !isExternalLink(link.target)).length
  }, [activePath, indexedTargetFile, targetContent, targetPath])
  const errorProblems = useMemo(
    () => problems.filter((problem) => problem.severity === 'error'),
    [problems],
  )
  const warningProblems = useMemo(
    () => problems.filter((problem) => problem.severity !== 'error'),
    [problems],
  )
  const targetLabel = targetPath ? createFileLabel(targetPath) : t('inspector.none')

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

  const handleOpenProblem = (problem: MarkdownSourceDiagnostic) => {
    if (!targetPath) return
    setPendingSourcePosition({
      path: targetPath,
      line: problem.line,
      column: problem.startColumn,
    })
    if (targetPath !== activePath) {
      onOpenFile(targetPath)
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
      className={`layout-rail workspace-rail flex flex-col border-l border-sidebar-border/80 ${
        collapsed ? 'w-14' : 'w-72'
      }`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {!collapsed ? (
        <div className="flex h-full flex-col p-1.5">
          <div className="sidebar-section rounded-md p-2">
            <div className="flex min-w-0 items-start gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-sidebar-border bg-background/70">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{targetLabel}</div>
                <div
                  className="mt-0.5 truncate text-[11px] text-muted-foreground"
                  title={targetPath ?? ''}
                >
                  {targetPath ?? t('editor.empty')}
                </div>
              </div>
              <Badge variant="secondary" className="rounded px-2 py-0.5 text-[10px]">
                {viewMode === 'graph'
                  ? t('tabs.workspaceGraph')
                  : activePath
                    ? t('inspector.currentFile')
                    : t('inspector.none')}
              </Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <InspectorMetric
                icon={<Hash className="h-3.5 w-3.5" />}
                label={t('inspector.outline')}
                value={outline.length}
              />
              <InspectorMetric
                icon={<Link2 className="h-3.5 w-3.5" />}
                label={t('inspector.backlinks')}
                value={backlinks.length}
              />
              <InspectorMetric
                icon={<CircleAlert className="h-3.5 w-3.5" />}
                label={t('inspector.problems')}
                value={problems.length}
                tone={problems.length > 0 ? 'warning' : 'normal'}
              />
              <InspectorMetric
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('status.lines')}
                value={documentStats.lines}
              />
            </div>
            <Separator className="my-1 bg-sidebar-border/70" />
            <div className="flex gap-1">
              <TooltipProvider>
                {quickActions.map((action) => (
                  <Tooltip key={action.label}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`chrome-button h-7 w-7 rounded-md ${
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

          <Tabs defaultValue="outline" className="mt-1.5 flex min-h-0 flex-1 flex-col">
            <TabsList className="grid h-8 w-full grid-cols-4 rounded-md border border-sidebar-border bg-background/65 p-0.5">
              <TabsTrigger value="outline" className="gap-1 rounded px-1 text-[11px]">
                <ListTree className="h-3.5 w-3.5" />
                {t('inspector.outline')}
              </TabsTrigger>
              <TabsTrigger value="backlinks" className="gap-1 rounded px-1 text-[11px]">
                <Link2 className="h-3.5 w-3.5" />
                {t('inspector.backlinks')}
              </TabsTrigger>
              <TabsTrigger value="problems" className="gap-1 rounded px-1 text-[11px]">
                <CircleAlert className="h-3.5 w-3.5" />
                {t('inspector.problems')}
              </TabsTrigger>
              <TabsTrigger value="properties" className="gap-1 rounded px-1 text-[11px]">
                <FileText className="h-3.5 w-3.5" />
                {t('inspector.properties')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="outline" className="mt-1 min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName="p-1">
                {!targetPath ? (
                  <InspectorEmptyState
                    icon={<FileText className="h-4 w-4" />}
                    title={t('inspector.none')}
                    description={t('editor.empty')}
                  />
                ) : outline.length === 0 ? (
                  <InspectorEmptyState
                    icon={<ListTree className="h-4 w-4" />}
                    title={t('inspector.noOutline')}
                    description={targetLabel}
                  />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {outline.map((heading) => (
                      <Button
                        key={`${heading.slug}-${heading.level}`}
                        variant="ghost"
                        size="sm"
                        className="inspector-row h-7 w-full justify-start rounded-md px-2 text-xs"
                        style={{ paddingLeft: 6 + (heading.level - 1) * 12 }}
                        onClick={() => handleOpenHeading(heading.slug)}
                      >
                        <Badge variant="secondary" className="mr-2 rounded px-1 py-0 text-[10px]">
                          H{heading.level}
                        </Badge>
                        <span className="truncate">{heading.text}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="backlinks" className="mt-1 min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName="p-1">
                {!targetPath ? (
                  <InspectorEmptyState
                    icon={<FileText className="h-4 w-4" />}
                    title={t('inspector.none')}
                    description={t('editor.empty')}
                  />
                ) : backlinks.length === 0 ? (
                  <InspectorEmptyState
                    icon={<Link2 className="h-4 w-4" />}
                    title={t('inspector.noBacklinks')}
                    description={targetLabel}
                  />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {backlinks.map((backlink, index) => (
                      <Button
                        key={`${backlink.sourcePath}-${index}`}
                        variant="ghost"
                        size="sm"
                        className="inspector-row h-auto min-h-11 w-full items-start justify-start rounded-md px-2 py-1.5 text-left"
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
                            <span className="mt-0.5 block whitespace-normal text-[11px] leading-4 text-muted-foreground/80">
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

            <TabsContent value="problems" className="mt-1 min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName="p-1">
                {!targetPath ? (
                  <InspectorEmptyState
                    icon={<FileText className="h-4 w-4" />}
                    title={t('inspector.none')}
                    description={t('editor.empty')}
                  />
                ) : problems.length === 0 ? (
                  <InspectorEmptyState
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    title={t('inspector.noProblems')}
                    description={targetLabel}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {errorProblems.length > 0 && (
                      <ProblemGroupHeader
                        label={t('inspector.problemError')}
                        count={errorProblems.length}
                        tone="error"
                      />
                    )}
                    {errorProblems.map((problem, index) => {
                      const Icon = problemIcon(problem.severity)
                      return (
                        <Button
                          key={`error-${problem.line}-${problem.startColumn}-${index}`}
                          variant="ghost"
                          size="sm"
                          className="inspector-row h-auto min-h-9 w-full justify-start rounded-md px-2 py-1 text-left"
                          onClick={() => handleOpenProblem(problem)}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${problemClasses(problem.severity)}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {problem.severity === 'error'
                                ? t('inspector.problemError')
                                : t('inspector.problemWarning')}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {problem.message}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                              {t('tabs.editor')} · line {problem.line}:{problem.startColumn}
                            </span>
                          </span>
                        </Button>
                      )
                    })}
                    {warningProblems.length > 0 && (
                      <ProblemGroupHeader
                        label={t('inspector.problemWarning')}
                        count={warningProblems.length}
                        tone="warning"
                      />
                    )}
                    {warningProblems.map((problem, index) => {
                      const Icon = problemIcon(problem.severity)
                      return (
                        <Button
                          key={`warning-${problem.line}-${problem.startColumn}-${index}`}
                          variant="ghost"
                          size="sm"
                          className="inspector-row h-auto min-h-9 w-full justify-start rounded-md px-2 py-1 text-left"
                          onClick={() => handleOpenProblem(problem)}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${problemClasses(problem.severity)}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {t('inspector.problemWarning')}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {problem.message}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                              {t('tabs.editor')} · line {problem.line}:{problem.startColumn}
                            </span>
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="properties" className="mt-1 min-h-0 flex-1 overflow-hidden">
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
                    <div className="grid grid-cols-2 gap-2">
                      <PropertyCell label={t('status.lines')} value={documentStats.lines} />
                      <PropertyCell label={t('status.words')} value={documentStats.words} />
                      <PropertyCell label={t('inspector.outline')} value={outline.length} />
                      <PropertyCell label={t('inspector.backlinks')} value={outgoingLinkCount} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <PropertyCell label={t('inspector.kind')} value={displayMetadata.kind} />
                      <PropertyCell
                        label={t('inspector.size')}
                        value={formatBytes(displayMetadata.size_bytes)}
                      />
                      <PropertyCell
                        label={t('inspector.modified')}
                        value={
                          displayMetadata.modified_ms
                            ? new Date(displayMetadata.modified_ms).toLocaleString()
                            : t('inspector.unknown')
                        }
                      />
                      <PropertyCell
                        label={t('inspector.readonly')}
                        value={displayMetadata.readonly ? t('common.yes') : t('common.no')}
                      />
                    </div>
                    <div>
                      <div className="text-muted-foreground">{t('inspector.path')}</div>
                      <div className="break-all font-medium">{displayMetadata.path}</div>
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

function InspectorMetric({
  icon,
  label,
  value,
  tone = 'normal',
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  tone?: 'normal' | 'warning' | 'error'
}) {
  const toneClass =
    tone === 'error'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-foreground'

  return (
    <div className="side-stat flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{label}</span>
      <span className={`shrink-0 text-xs font-semibold ${toneClass}`}>{value}</span>
    </div>
  )
}

function InspectorEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-md border border-dashed border-sidebar-border/80 bg-background/45 px-3 text-center">
      <div className="mb-2 rounded-md border border-border bg-muted p-2 text-muted-foreground">
        {icon}
      </div>
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-1 max-w-[13rem] truncate text-[11px] text-muted-foreground">
        {description}
      </div>
    </div>
  )
}

function ProblemGroupHeader({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'warning' | 'error'
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 text-[11px] font-medium ${
        tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
      }`}
    >
      <span>{label}</span>
      <span>{count}</span>
    </div>
  )
}

function PropertyCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/55 p-2">
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium">{value}</div>
    </div>
  )
}

export default memo(RightSidebarComponent)
