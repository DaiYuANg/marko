import { memo, useCallback, useEffect, useRef, type WheelEvent } from 'react'
import { Code2, FileText, GitGraph, PenLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  silentSave: boolean
}

const formatTabLabel = (path: string, compact: boolean) => {
  const label = createFileLabel(path)
  if (!compact || label.length <= 12) return label
  return `${label.slice(0, 11)}…`
}

const getSaveLabelKey = (state?: SaveState) => {
  if (!state) return null
  if (state.status === 'saved') return null
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
  silentSave,
}: TabsBarProps) => {
  const { t } = useI18n()
  const tabsViewportRef = useRef<HTMLDivElement | null>(null)
  const activeTab = activePath ?? ''
  const compact = tabs.length >= 8
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const activeSaveLabelKey = getSaveLabelKey(activeSaveState)

  const handleTabsWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget
    if (viewport.scrollWidth <= viewport.clientWidth) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    viewport.scrollLeft += event.deltaY
    event.preventDefault()
  }, [])

  useEffect(() => {
    if (!activePath) return
    const viewport = tabsViewportRef.current
    const activeTrigger = Array.from(
      viewport?.querySelectorAll<HTMLElement>('[data-tab-path]') ?? [],
    ).find((trigger) => trigger.dataset.tabPath === activePath)
    activeTrigger?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activePath])

  return (
    <div className="tab-strip flex h-10 items-center gap-2 border-b border-border/80 px-2">
      <Tabs
        className="min-w-0 flex-1"
        value={activeTab}
        onValueChange={(path) => {
          if (path) {
            onOpenFile(path)
          }
        }}
      >
        <div
          ref={tabsViewportRef}
          className="tabs-scrollbar w-full overflow-x-auto overflow-y-hidden whitespace-nowrap"
          onWheel={handleTabsWheel}
        >
          <TabsList className="inline-flex h-8 w-max min-w-full justify-start rounded-none bg-transparent p-0">
            {tabs.map((path) => {
              const saveState = saveStates[path]
              const isDirty = !silentSave && Boolean(dirtyPaths[path])
              const hasError = saveState?.status === 'error'
              const isActive = path === activePath
              return (
                <TabsTrigger
                  key={path}
                  value={path}
                  data-tab-path={path}
                  className="tab-item group relative h-8 shrink-0 gap-1.5 rounded-md px-2 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm after:absolute after:bottom-0 after:left-2 after:right-2 after:hidden after:h-0.5 after:rounded-full after:bg-primary data-[state=active]:after:block"
                  title={path}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className={`${compact ? 'max-w-[86px]' : 'max-w-[160px]'} truncate`}>
                    {formatTabLabel(path, compact)}
                  </span>
                  {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  {hasError && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                  <span
                    role="button"
                    tabIndex={0}
                    className={`ml-0.5 rounded p-0.5 transition-all duration-150 hover:bg-muted ${
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
        </div>
      </Tabs>
      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span className="max-w-[180px] truncate">
            {activePath ? createFileLabel(activePath) : t('center.noFile')}
          </span>
          {!silentSave && activePath && dirtyPaths[activePath] && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          )}
          {activeSaveLabelKey && (activeSaveState?.status === 'error' || !silentSave) && (
            <Badge
              variant="outline"
              className={`h-5 shrink-0 px-1.5 text-[10px] font-medium ${getSaveBadgeClassName(activeSaveState)}`}
              title={activeSaveState?.message}
            >
              {t(activeSaveLabelKey)}
            </Badge>
          )}
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/70 p-0.5 shadow-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'wysiwyg' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-6 w-6 rounded"
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
                  className="h-6 w-6 rounded"
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
                  className="h-6 w-6 rounded"
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
    </div>
  )
}

export default memo(TabsBarComponent)
