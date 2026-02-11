import { useCallback, useMemo, type WheelEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createFileLabel } from '@/logic/paths'
import { useI18n } from '@/i18n/useI18n'

type TabsBarProps = {
  tabs: string[]
  onOpenFile: (path: string) => void
  onCloseTab: (path: string) => void
  pathToSlug: Map<string, string>
  slugToPath: Map<string, string>
}

export default function TabsBar({
  tabs,
  onOpenFile,
  onCloseTab,
  pathToSlug,
  slugToPath,
}: TabsBarProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const isGraph = location.pathname.includes('graph')
  const rawPath = location.pathname.replace(/^#?/, '')
  const activeSlug = rawPath.startsWith('/graph') ? '' : rawPath.replace(/^\//, '')
  const routes = useMemo(
    () => tabs.map((tab) => ({ path: tab, slug: pathToSlug.get(tab) ?? tab })),
    [pathToSlug, tabs],
  )
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
    <div className="flex items-center gap-3 border-b border-border bg-white/70 px-4 py-2">
      <Tabs
        className="min-w-0 flex-1"
        value={activeSlug}
        onValueChange={(slug) => {
          const path = slugToPath.get(slug)
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
          <TabsList className="w-max min-w-full">
            {routes.map((tab) => (
              <TabsTrigger key={tab.path} value={tab.slug}>
                {createFileLabel(tab.path)}
                <span
                  className="text-xs opacity-70"
                  role="presentation"
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseTab(tab.path)
                  }}
                >
                  ×
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant={!isGraph ? 'default' : 'secondary'}
          size="sm"
          onClick={() => {
            if (activeSlug) {
              navigate(`/${activeSlug}`)
            }
          }}
        >
          {t('tabs.editor')}
        </Button>
        <Button
          variant={isGraph ? 'default' : 'secondary'}
          size="sm"
          onClick={() => navigate('/graph')}
        >
          {t('tabs.graph')}
        </Button>
      </div>
    </div>
  )
}
