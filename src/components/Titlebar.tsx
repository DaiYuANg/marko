import {
  FileText,
  FolderOpen,
  Languages,
  PanelLeft,
  PanelRight,
  Palette,
  Search,
} from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ThemeMode } from '@/store/useAppStore'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'

type TitlebarProps = {
  onToggleSidebar: () => void
  onToggleRightSidebar: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

export default function Titlebar({
  onToggleSidebar,
  onToggleRightSidebar,
  onSelectProject,
  onSelectSingleFile,
  isMaximized,
  setIsMaximized,
  theme,
  setTheme,
}: TitlebarProps) {
  const getAppWindow = () => (isTauri() ? getCurrentWindow() : null)
  const { t, locale, setLocale } = useI18n()
  const isWindows =
    typeof window !== 'undefined' && window.navigator.userAgent.toLowerCase().includes('windows')
  const onOpenSearch = () => {
    window.dispatchEvent(new CustomEvent('marko:focus-file-search'))
  }

  return (
    <header
      className="app-titlebar panel-enter flex h-11 items-center justify-between border-b border-border/70 bg-background/80 px-2 backdrop-blur"
      data-tauri-drag-region
    >
      <TooltipProvider>
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                aria-label={t('actions.toggleSidebar')}
                className="h-8 w-8 rounded-lg"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleSidebar')}</TooltipContent>
          </Tooltip>
          <div className="min-w-0 px-1">
            <div className="truncate text-sm font-semibold tracking-tight">{t('app.name')}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {t('titlebar.subtitle')}
            </div>
          </div>
        </div>
        <div className="mx-2 hidden flex-1 items-center justify-center md:flex">
          <button
            type="button"
            className="h-7 w-full max-w-sm rounded-lg border border-border/80 bg-muted/40 px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onOpenSearch}
          >
            <span className="inline-flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              <span>{t('sidebar.search')}</span>
              <span className="ml-auto rounded border border-border/70 px-1.5 py-0.5 text-[10px]">
                Ctrl+P
              </span>
            </span>
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={onSelectProject}
                aria-label={t('actions.openProject')}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.openProject')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={onSelectSingleFile}
                aria-label={t('actions.openFile')}
              >
                <FileText className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.openFile')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg md:hidden"
                onClick={onOpenSearch}
                aria-label={t('sidebar.searchAction')}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('sidebar.searchAction')}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                aria-label={t('menu.theme')}
              >
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>{t('menu.theme')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as ThemeMode)}
              >
                <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(value) => setLocale(value as Locale)}
              >
                <DropdownMenuRadioItem value="zh-CN">
                  <Languages className="mr-1 h-3.5 w-3.5" />
                  {t('language.zh')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en-US">
                  <Languages className="mr-1 h-3.5 w-3.5" />
                  {t('language.en')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={onToggleRightSidebar}
                aria-label={t('actions.toggleRightSidebar')}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleRightSidebar')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <div className="window-controls flex items-center">
        <Separator orientation="vertical" className="mr-1 h-6" />
        <Button
          variant="ghost"
          size="icon"
          className={`win-caption-btn ${isWindows ? 'is-windows' : 'h-8 w-8'}`}
          onClick={() => {
            const windowHandle = getAppWindow()
            if (windowHandle) {
              void windowHandle.minimize()
            }
          }}
          aria-label={t('actions.minimize')}
        >
          {isWindows ? (
            <span className="win-caption-glyph" aria-hidden>
              {'\uE921'}
            </span>
          ) : (
            <span aria-hidden>-</span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`win-caption-btn ${isWindows ? 'is-windows' : 'h-8 w-8'}`}
          onClick={async () => {
            const windowHandle = getAppWindow()
            if (!windowHandle) return
            const next = !(await windowHandle.isMaximized())
            if (next) {
              await windowHandle.maximize()
            } else {
              await windowHandle.unmaximize()
            }
            setIsMaximized(next)
          }}
          aria-label={isMaximized ? t('actions.restore') : t('actions.maximize')}
        >
          {isWindows ? (
            <span className="win-caption-glyph" aria-hidden>
              {isMaximized ? '\uE923' : '\uE922'}
            </span>
          ) : (
            <span aria-hidden>{isMaximized ? '◱' : '□'}</span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`win-caption-btn win-caption-close ${isWindows ? 'is-windows' : 'h-8 w-8 hover:bg-destructive hover:text-destructive-foreground'}`}
          onClick={() => {
            const windowHandle = getAppWindow()
            if (windowHandle) {
              void windowHandle.close()
            }
          }}
          aria-label={t('actions.close')}
        >
          {isWindows ? (
            <span className="win-caption-glyph" aria-hidden>
              {'\uE8BB'}
            </span>
          ) : (
            <span aria-hidden>×</span>
          )}
        </Button>
      </div>
    </header>
  )
}
