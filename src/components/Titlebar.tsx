import { FolderOpen, GitBranch, Palette } from 'lucide-react'
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

  return (
    <header
      className="app-titlebar flex items-center justify-between border-b border-border bg-white/80 px-4 py-2"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          {sidebarCollapsed ? '▸' : '◂'}
        </Button>
        <div>
          <div className="text-sm font-semibold">MD Mind</div>
          <div className="text-xs text-muted-foreground">Typora 风格 · 项目图谱</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onSelectProject}>
          <FolderOpen className="h-4 w-4" />
          打开项目
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Theme">
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeMode)}>
              <DropdownMenuRadioItem value="warm">Warm</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" aria-label="Git Sync">
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
          aria-label="Minimize"
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
          aria-label="Maximize"
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
          aria-label="Close"
        >
          ×
        </Button>
      </div>
    </header>
  )
}
