import { FolderOpen, GitBranch, Languages, PanelLeft, PanelRight, Palette } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

export default function Titlebar({
  onToggleSidebar,
  onToggleRightSidebar,
  onSelectProject,
  isMaximized,
  setIsMaximized,
  theme,
  setTheme,
}: TitlebarProps) {
  const getAppWindow = () => (isTauri() ? getCurrentWindow() : null)
  const { t, locale, setLocale } = useI18n()
  const isWindows =
    typeof window !== 'undefined' && window.navigator.userAgent.toLowerCase().includes('windows')

  return (
    <header
      className="app-titlebar flex h-12 items-center justify-between border-b border-border bg-background px-2"
      data-tauri-drag-region
    >
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                aria-label={t('actions.toggleSidebar')}
                className="h-8 w-8"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleSidebar')}</TooltipContent>
          </Tooltip>
          <div className="px-1 text-sm font-medium tracking-tight">{t('app.name')}</div>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
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
                className="h-8 w-8"
                onClick={onToggleRightSidebar}
                aria-label={t('actions.toggleRightSidebar')}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleRightSidebar')}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('menu.theme')}>
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as ThemeMode)}
              >
                <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t('menu.language')}
              >
                <Languages className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(value) => setLocale(value as Locale)}
              >
                <DropdownMenuRadioItem value="zh-CN">{t('language.zh')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en-US">{t('language.en')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t('actions.gitSync')}
              >
                <GitBranch className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.gitSync')}</TooltipContent>
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
