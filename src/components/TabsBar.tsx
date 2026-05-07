import { memo, useCallback, type WheelEvent } from 'react'
import { Code2, FileText, GitGraph, PenLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createFileLabel } from '@/logic/paths'
import { useI18n } from '@/i18n/useI18n'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ViewMode } from '@/store/useAppStore'
import type { SaveState } from '@/app/useEditorBuffer'

type TabsBarProps = {
  tabs: string[]
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  activePath: string | null
  onOpenFile: (path: string) => void
  onCloseTab: (path: string) => void
  viewMode: ViewMode
  onChangeView: (mode: ViewMode) => void
}

const formatTabLabel = (path: string, compact: boolean) => {
  const label = createFileLabel(path)
  if (!compact || label.length <= 12) return label
  return `${label.slice(0, 11)}…`
}

const getSaveLabelKey = (state?: SaveState) => {
  if (!state) return null
  if (state.status === 'saved') return 'save.saved'
  if (state.status === 'saving') return 'save.saving'
  if (state.status === 'error') return 'save.error'
  return 'save.unsaved'
}

const getSaveBadgeClassName = (state?: SaveState) => {
  if (state?.status === 'saved') return 'border-emerald-500/30 text-emerald-600'
  if (state?.status === 'saving') return 'border-sky-500/30 text-sky-600'
  if (state?.status === 'error') return 'border-destructive/30 text-destructive'
  return 'border-amber-500/30 text-amber-600'
}

const TabsBarComponent = ({
  tabs,
  dirtyPaths,
  saveStates,
  activePath,
  onOpenFile,
  onCloseTab,
  viewMode,
  onChangeView,
}: TabsBarProps) => {
  const { t } = useI18n()
  const activeTab = activePath ?? ''
  const compact = tabs.length >= 8
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const activeSaveLabelKey = getSaveLabelKey(activeSaveState)

  const handleTabsWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLDivElement | null
    if (!viewport) return
    if (viewport.scrollWidth <= viewport.clientWidth) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    viewport.scrollLeft += event.deltaY
    event.preventDefault()
  }, [])

  return (
    <div className="border-b border-border/70 bg-background/85 px-2 py-1 backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0 truncate text-sm font-medium">
            {activePath ? createFileLabel(activePath) : t('center.noFile')}
          </div>
          {activePath && dirtyPaths[activePath] && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]" />
          )}
          {activeSaveLabelKey && (
            <Badge
              variant="outline"
              className={`hidden h-5 shrink-0 px-2 text-[10px] font-medium md:inline-flex ${getSaveBadgeClassName(activeSaveState)}`}
              title={activeSaveState?.message}
            >
              {t(activeSaveLabelKey)}
            </Badge>
          )}
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/35 p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'wysiwyg' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  aria-label={t('editor.modeWysiwyg')}
                  onClick={() => onChangeView('wysiwyg')}
                >
                  <PenLine className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('editor.modeWysiwyg')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'source' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  aria-label={t('editor.modeSource')}
                  onClick={() => onChangeView('source')}
                >
                  <Code2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('editor.modeSource')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  aria-label={t('tabs.workspaceGraph')}
                  onClick={() => onChangeView('graph')}
                >
                  <GitGraph className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('tabs.workspaceGraph')}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
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
          className="w-full whitespace-nowrap rounded-lg"
          onWheel={handleTabsWheel}
          viewportClassName="w-full"
        >
          <TabsList className="h-9 w-max min-w-full justify-start rounded-lg border border-border/50 bg-muted/35 p-0.5">
            {tabs.map((path) => {
              const isDirty = Boolean(dirtyPaths[path])
              const isActive = path === activePath
              return (
                <TabsTrigger
                  key={path}
                  value={path}
                  className="group gap-1.5 rounded-md px-2 data-[state=active]:animate-[tab-pop_160ms_cubic-bezier(0.22,1,0.36,1)] data-[state=active]:shadow-sm"
                  title={path}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className={`${compact ? 'max-w-[86px]' : 'max-w-[160px]'} truncate`}>
                    {formatTabLabel(path, compact)}
                  </span>
                  {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  <span
                    role="button"
                    tabIndex={0}
                    className={`ml-0.5 rounded p-0.5 transition-all duration-150 hover:scale-105 hover:bg-muted ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onCloseTab(path)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      onCloseTab(path)
                    }}
                    aria-label="Close tab"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </ScrollArea>
      </Tabs>
      <Separator className="mt-1" />
    </div>
  )
}

export default memo(TabsBarComponent)
