import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { InspectorMetric } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type { ViewMode } from '@/store/useAppStore'
import { CircleAlert, Code2, FileText, GitGraph, Hash, Link2, PenLine } from 'lucide-react'
import { useMemo } from 'react'

type RightSidebarSummaryProps = {
  activePath: string | null
  targetPath: string | null
  targetLabel: string
  viewMode: ViewMode
  outlineCount: number
  backlinksCount: number
  problemsCount: number
  lineCount: number
  onChangeView: (mode: ViewMode) => void
}

export function RightSidebarSummary({
  activePath,
  targetPath,
  targetLabel,
  viewMode,
  outlineCount,
  backlinksCount,
  problemsCount,
  lineCount,
  onChangeView,
}: RightSidebarSummaryProps) {
  const { t } = useI18n()
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

  return (
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
          value={outlineCount}
        />
        <InspectorMetric
          icon={<Link2 className="h-3.5 w-3.5" />}
          label={t('inspector.backlinks')}
          value={backlinksCount}
        />
        <InspectorMetric
          icon={<CircleAlert className="h-3.5 w-3.5" />}
          label={t('inspector.problems')}
          value={problemsCount}
          tone={problemsCount > 0 ? 'warning' : 'normal'}
        />
        <InspectorMetric
          icon={<FileText className="h-3.5 w-3.5" />}
          label={t('status.lines')}
          value={lineCount}
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
  )
}
