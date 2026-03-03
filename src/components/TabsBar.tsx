import { memo, useCallback, useMemo, type WheelEvent } from 'react'
import { FileText, GitGraph, PencilLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createFileLabel } from '@/logic/paths'
import { useI18n } from '@/i18n/useI18n'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ViewMode } from '@/store/useAppStore'

type TabsBarProps = {
  tabs: string[]
  activePath: string | null
  onOpenFile: (path: string) => void
  onCloseTab: (path: string) => void
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
}

function TabsBarComponent({
  tabs,
  activePath,
  onOpenFile,
  onCloseTab,
  viewMode,
  onChangeView,
}: TabsBarProps) {
  const { t } = useI18n()
  const activeTab = activePath ?? ''
  const routes = useMemo(() => tabs.map((tab) => ({ path: tab })), [tabs])
  const handleTabsWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLDivElement | null
    if (!viewport) return
    const canScrollHorizontally = viewport.scrollWidth > viewport.clientWidth
    if (!canScrollHorizontally) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    viewport.scrollLeft += event.deltaY
    event.preventDefault()
  }, [])

  return (
    <div className="border-b border-border bg-background px-2 py-1.5">
      <TooltipProvider>
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="truncate text-sm font-medium">
              {activePath ? createFileLabel(activePath) : t('center.noFile')}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
              <Button
                  variant={viewMode !== 'graph' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChangeView('wysiwyg')}
                  aria-label={t('tabs.editor')}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('tabs.editor')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
              <Button
                  variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChangeView('graph')}
                  aria-label={t('tabs.workspaceGraph')}
                >
                  <GitGraph className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('tabs.workspaceGraph')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
      <Tabs
        className="min-w-0"
        value={activeTab}
        onValueChange={(path) => {
          if (path) {
            onOpenFile(path)
          }
        }}
      >
        <ScrollArea
          className="w-full whitespace-nowrap"
          onWheel={handleTabsWheel}
          viewportClassName="w-full"
        >
          <TabsList className="h-9 w-max min-w-full justify-start rounded-md bg-muted/40 p-1">
            {routes.map((tab) => (
              <TabsTrigger key={tab.path} value={tab.path} className="gap-1.5 rounded-sm px-2.5">
                <FileText className="h-3.5 w-3.5" />
                <span>{createFileLabel(tab.path)}</span>
                <span
                  className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                  role="presentation"
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseTab(tab.path)
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>
      <Separator className="mt-1.5" />
    </div>
  )
}

export default memo(TabsBarComponent)
