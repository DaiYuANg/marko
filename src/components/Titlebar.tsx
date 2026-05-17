import { FileText, FolderOpen, PanelLeft, PanelRight, Search, Settings2 } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { FileEntry, ThemeMode, ViewMode } from '@/store/useAppStore'
import { useI18n } from '@/i18n/useI18n'
import { appApi, type AppPlatform } from '@/services/appApi'
import AppMenuBar from '@/components/AppMenuBar'
import SettingsDialog from '@/components/SettingsDialog'
import { inferPlatformFromUserAgent, isTauriRuntime } from '@/utils/tauri'
import type { FsSearchResult, FsWorkspaceIndex } from '@/services/fsApi'
import { createFileLabel } from '@/logic/paths'
import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'
import WindowControls from '@/components/WindowControls'
import TitlebarThemeMenu from '@/components/TitlebarThemeMenu'

type TitlebarProps = {
  onToggleSidebar: () => void
  onToggleRightSidebar: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onChangeView: (mode: ViewMode) => void
  files: FileEntry[]
  workspaceIndex: FsWorkspaceIndex | null
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

function Titlebar({
  onToggleSidebar,
  onToggleRightSidebar,
  onSelectProject,
  onSelectSingleFile,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onChangeView,
  files,
  workspaceIndex,
  isMaximized,
  setIsMaximized,
  theme,
  setTheme,
}: TitlebarProps) {
  const getAppWindow = useCallback(async () => {
    if (!isTauriRuntime()) return null
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow()
  }, [])
  const { t } = useI18n()
  const [platform, setPlatform] = useState<AppPlatform>(inferPlatformFromUserAgent())
  const [commandOpen, setCommandOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isWindows =
    typeof window !== 'undefined' && window.navigator.userAgent.toLowerCase().includes('windows')
  const showInlineMenu = platform === 'windows' || platform === 'linux'

  useEffect(() => {
    if (!isTauriRuntime()) return
    void appApi
      .getPlatform()
      .then((next) => setPlatform(next))
      .catch(() => {})
  }, [])
  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      const withCommand = event.ctrlKey || event.metaKey
      if (!withCommand || event.key.toLowerCase() !== 'p') return
      event.preventDefault()
      setCommandOpen(true)
    }
    window.addEventListener('keydown', onHotkey)
    return () => {
      window.removeEventListener('keydown', onHotkey)
    }
  }, [])

  const menuGroups = useMemo(
    () => [
      {
        label: 'File',
        items: [
          { id: 'file.new', label: 'New File' },
          { id: 'file.open_project', label: t('actions.openProject') },
          { id: 'file.open_file', label: t('actions.openFile') },
          { id: 'file.export_pdf', label: t('actions.exportPdf') },
          { id: 'file.export_docx', label: t('actions.exportDocx') },
          { id: 'file.export_html', label: t('actions.exportHtml') },
        ],
      },
      {
        label: 'Edit',
        items: [
          { id: 'edit.undo', label: 'Undo' },
          { id: 'edit.redo', label: 'Redo' },
          { id: 'edit.cut', label: 'Cut' },
          { id: 'edit.copy', label: 'Copy' },
          { id: 'edit.paste', label: 'Paste' },
          { id: 'edit.select_all', label: 'Select All' },
        ],
      },
      {
        label: 'View',
        items: [
          { id: 'view.wysiwyg', label: t('editor.modeWysiwyg') },
          { id: 'view.source', label: t('editor.modeSource') },
          { id: 'view.graph', label: t('tabs.workspaceGraph') },
          { id: 'view.toggle_sidebar', label: t('actions.toggleSidebar') },
          { id: 'view.toggle_right_sidebar', label: t('actions.toggleRightSidebar') },
        ],
      },
      {
        label: 'Theme',
        items: [
          { id: 'theme.light', label: t('theme.light') },
          { id: 'theme.dark', label: t('theme.dark') },
          { id: 'theme.marko-light', label: t('theme.markoLight') },
          { id: 'theme.marko-dark', label: t('theme.markoDark') },
        ],
      },
      {
        label: 'Help',
        items: [{ id: 'help.about', label: 'About marko' }],
      },
    ],
    [t],
  )

  const commandFiles = useMemo(() => {
    const paths = workspaceIndex
      ? workspaceIndex.files.map((file) => file.path)
      : files.filter((file) => file.kind === 'file').map((file) => file.path)

    return paths.map((path) => ({
      path,
      label: createFileLabel(path),
    }))
  }, [files, workspaceIndex])

  const commandHeadings = useMemo(() => {
    if (!workspaceIndex) return []
    return workspaceIndex.files.flatMap((file) =>
      file.headings.map((heading) => ({
        path: file.path,
        slug: heading.slug,
        text: heading.text,
        level: heading.level,
        label: createFileLabel(file.path),
      })),
    )
  }, [workspaceIndex])

  const onMenuAction = useCallback((id: string) => {
    if (!isTauriRuntime()) return
    void appApi.menuDispatch(id)
  }, [])
  const onFocusFileSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('marko:focus-file-search'))
  }, [])
  const onOpenSearch = useCallback(() => {
    setCommandOpen(true)
  }, [])
  const onCommandAction = useCallback(
    (id: string) => {
      setCommandOpen(false)
      if (id === 'view.wysiwyg') {
        onChangeView('wysiwyg')
        return
      }
      if (id === 'view.source') {
        onChangeView('source')
        return
      }
      if (id === 'view.graph') {
        onChangeView('graph')
        return
      }
      if (id === 'file.open_project') {
        onSelectProject()
        return
      }
      if (id === 'file.open_file') {
        onSelectSingleFile()
        return
      }
      if (id === 'view.toggle_sidebar') {
        onToggleSidebar()
        return
      }
      if (id === 'view.toggle_right_sidebar') {
        onToggleRightSidebar()
        return
      }
      if (id === 'view.focus_file_search') {
        onFocusFileSearch()
        return
      }
      if (id === 'settings.open') {
        setSettingsOpen(true)
        return
      }
      if (
        id === 'theme.light' ||
        id === 'theme.dark' ||
        id === 'theme.marko-light' ||
        id === 'theme.marko-dark'
      ) {
        setTheme(id as ThemeMode)
        return
      }
      if (id === 'help.about' || id.startsWith('file.export_')) {
        onMenuAction(id)
      }
    },
    [
      onChangeView,
      onFocusFileSearch,
      onMenuAction,
      onSelectProject,
      onSelectSingleFile,
      onToggleRightSidebar,
      onToggleSidebar,
      setTheme,
    ],
  )

  const onCommandOpenFile = useCallback(
    (path: string) => {
      setCommandOpen(false)
      onOpenFile(path)
    },
    [onOpenFile],
  )

  const onCommandOpenHeading = useCallback(
    (path: string, slug: string) => {
      setCommandOpen(false)
      onOpenHeading(path, slug)
    },
    [onOpenHeading],
  )

  const onCommandOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      setCommandOpen(false)
      onOpenSearchResult(result)
    },
    [onOpenSearchResult],
  )

  const isMacTauri = platform === 'macos' && isTauriRuntime()

  const handleTitlebarMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!isTauriRuntime() || platform !== 'macos') return
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (
        target.closest(
          'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-no-drag]',
        )
      )
        return
      void getAppWindow().then((windowHandle) => windowHandle?.startDragging())
    },
    [getAppWindow, platform],
  )

  return (
    <header
      className={`app-titlebar flex h-11 items-center justify-between border-b border-border/80 px-2.5 ${isMacTauri ? 'pl-[68px]' : ''}`}
      data-tauri-drag-region
      onMouseDown={handleTitlebarMouseDown}
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
                className="chrome-button h-8 w-8 rounded-md"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleSidebar')}</TooltipContent>
          </Tooltip>
          <div className="flex min-w-0 items-center gap-2 px-1 leading-none">
            <div className="grid h-6 w-6 place-items-center rounded-md border border-border bg-primary text-[11px] font-semibold text-primary-foreground shadow-sm">
              M
            </div>
            <div className="truncate text-sm font-semibold tracking-[0.01em]">{t('app.name')}</div>
          </div>
          {showInlineMenu && <AppMenuBar groups={menuGroups} onAction={onMenuAction} />}
        </div>
        <div className="mx-2 hidden flex-1 items-center justify-center md:flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="command-trigger h-7 w-full max-w-md justify-start rounded-md px-3 text-left text-xs text-muted-foreground"
            onClick={onOpenSearch}
          >
            <span className="flex w-full items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              <span>{t('sidebar.search')}</span>
              <KbdGroup className="ml-auto">
                <Kbd>{isWindows ? 'Ctrl' : 'Cmd'}</Kbd>
                <Kbd>P</Kbd>
              </KbdGroup>
            </span>
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
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
                className="chrome-button h-8 w-8 rounded-md"
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
                className="chrome-button h-8 w-8 rounded-md md:hidden"
                onClick={onOpenSearch}
                aria-label={t('sidebar.searchAction')}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('sidebar.searchAction')}</TooltipContent>
          </Tooltip>
          <TitlebarThemeMenu
            theme={theme}
            setTheme={setTheme}
            onAbout={() => onMenuAction('help.about')}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
                onClick={() => setSettingsOpen(true)}
                aria-label={t('menu.settings')}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('menu.settings')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
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
      <TitlebarCommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        files={commandFiles}
        headings={commandHeadings}
        onOpenFile={onCommandOpenFile}
        onOpenHeading={onCommandOpenHeading}
        onOpenSearchResult={onCommandOpenSearchResult}
        onAction={onCommandAction}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <WindowControls
        platform={platform}
        isWindows={isWindows}
        isMaximized={isMaximized}
        setIsMaximized={setIsMaximized}
        getAppWindow={getAppWindow}
      />
    </header>
  )
}

export default memo(Titlebar)
