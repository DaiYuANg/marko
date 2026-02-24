import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import { BookOpen, FileText, GitGraph, LayoutGrid, Notebook, NotebookTabs } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

type RightSidebarProps = {
  collapsed: boolean
  activePath: string | null
  tabs: string[]
  totalFiles: number
  onOpenFile: (path: string) => void
}

export default function RightSidebar({
  collapsed,
  activePath,
  tabs,
  totalFiles,
  onOpenFile,
}: RightSidebarProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const quickActions = useMemo(() => {
    return [
      {
        label: t('tabs.workspaceGraph'),
        icon: GitGraph,
        onClick: () => navigate('/graph'),
      },
      {
        label: t('tabs.editor'),
        icon: Notebook,
        onClick: () => {
          if (activePath) {
            onOpenFile(activePath)
          }
        },
      },
    ]
  }, [activePath, navigate, onOpenFile, t])

  return (
    <aside
      className={`flex flex-col border-l border-border bg-background transition-all duration-300 ${
        collapsed ? 'w-14' : 'w-72'
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
                {activePath ? t('inspector.currentFile') : t('inspector.none')}
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

          <div className="flex flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('tabs.editor')}
            </div>
            <ScrollArea className="max-h-[calc(100vh-220px)]" viewportClassName="p-1">
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
