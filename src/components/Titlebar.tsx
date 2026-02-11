import { FolderOpen, GitBranch, Languages, Palette } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import type { ThemeMode } from '@/store/useAppStore'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'

type TitlebarProps = {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onSelectProject: () => void
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

export default function Titlebar({
  sidebarCollapsed,
  onToggleSidebar,
  onSelectProject,
  isMaximized,
  setIsMaximized,
  theme,
  setTheme,
}: TitlebarProps) {
  const getAppWindow = () => (isTauri() ? getCurrentWindow() : null)
  const { t, locale, setLocale } = useI18n()

  return (
    <header
      className="app-titlebar flex items-center justify-between border-b border-border bg-white/80 px-4 py-2"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          aria-label={t('actions.toggleSidebar')}
        >
          {sidebarCollapsed ? '▸' : '◂'}
        </Button>
        <div>
          <div className="text-sm font-semibold">{t('app.name')}</div>
          <div className="text-xs text-muted-foreground">{t('titlebar.subtitle')}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onSelectProject}>
          <FolderOpen className="h-4 w-4" />
          {t('actions.openProject')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('menu.theme')}>
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as ThemeMode)}
            >
              <DropdownMenuRadioItem value="warm">{t('theme.warm')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('menu.language')}>
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
        <Button variant="ghost" size="icon" aria-label={t('actions.gitSync')}>
          <GitBranch className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const windowHandle = getAppWindow()
            if (windowHandle) {
              void windowHandle.minimize()
            }
          }}
          aria-label={t('actions.minimize')}
        >
          ─
        </Button>
        <Button
          variant="secondary"
          size="icon"
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
          {isMaximized ? '❐' : '□'}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const windowHandle = getAppWindow()
            if (windowHandle) {
              void windowHandle.close()
            }
          }}
          aria-label={t('actions.close')}
        >
          ×
        </Button>
      </div>
    </header>
  )
}
