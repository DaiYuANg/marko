import {
  CircleHelp,
  FileText,
  FolderOpen,
  GitGraph,
  Languages,
  ListTree,
  PanelLeft,
  PanelRight,
  Palette,
  PenLine,
  Search,
} from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { FileEntry, ThemeMode, ViewMode } from '@/store/useAppStore'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { appApi, type AppPlatform } from '@/services/appApi'
import AppMenuBar from '@/components/AppMenuBar'
import { inferPlatformFromUserAgent, isTauriRuntime } from '@/utils/tauri'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import { createFileLabel } from '@/logic/paths'

type TitlebarProps = {
  onToggleSidebar: () => void
  onToggleRightSidebar: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onChangeView: (mode: ViewMode) => void
  files: FileEntry[]
  workspaceIndex: FsWorkspaceIndex | null
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
  onOpenFile,
  onOpenHeading,
  onChangeView,
  files,
  workspaceIndex,
  isMaximized,
  setIsMaximized,
  theme,
  setTheme,
}: TitlebarProps) {
  const getAppWindow = () => (isTauriRuntime() ? getCurrentWindow() : null)
  const { t, locale, setLocale } = useI18n()
  const [platform, setPlatform] = useState<AppPlatform>(inferPlatformFromUserAgent())
  const [commandOpen, setCommandOpen] = useState(false)
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

  const onMenuAction = (id: string) => {
    if (!isTauriRuntime()) return
    void appApi.menuDispatch(id)
  }
  const onFocusFileSearch = () => {
    window.dispatchEvent(new CustomEvent('marko:focus-file-search'))
  }
  const onOpenSearch = () => {
    setCommandOpen(true)
  }
  const onCommandAction = (id: string) => {
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
    if (
      id === 'theme.light' ||
      id === 'theme.dark' ||
      id === 'theme.marko-light' ||
      id === 'theme.marko-dark'
    ) {
      setTheme(id as ThemeMode)
      return
    }
    if (id === 'help.about') {
      onMenuAction(id)
      return
    }
    if (id.startsWith('file.export_')) {
      onMenuAction(id)
      return
    }
  }

  const onCommandOpenFile = (path: string) => {
    setCommandOpen(false)
    onOpenFile(path)
  }

  const onCommandOpenHeading = (path: string, slug: string) => {
    setCommandOpen(false)
    onOpenHeading(path, slug)
  }

  const isMacTauri = platform === 'macos' && isTauriRuntime()

  const handleTitlebarMouseDown = (e: ReactMouseEvent) => {
    if (!isTauriRuntime() || platform !== 'macos') return
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (
      target.closest(
        'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-no-drag]',
      )
    )
      return
    void getCurrentWindow().startDragging()
  }

  return (
    <header
      className={`app-titlebar panel-enter flex h-11 items-center justify-between border-b border-border/70 bg-background/80 px-2 backdrop-blur ${isMacTauri ? 'pl-[68px]' : ''}`}
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
          {showInlineMenu && <AppMenuBar groups={menuGroups} onAction={onMenuAction} />}
        </div>
        <div className="mx-2 hidden flex-1 items-center justify-center md:flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full max-w-sm justify-start rounded-lg border border-border/80 bg-muted/40 px-3 text-left text-xs text-muted-foreground hover:bg-muted/70"
            onClick={onOpenSearch}
          >
            <span className="inline-flex items-center gap-2">
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
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                {t('theme.groupShadcn')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as ThemeMode)}
              >
                <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                {t('theme.groupMarko')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as ThemeMode)}
              >
                <DropdownMenuRadioItem value="marko-light">
                  <PenLine className="mr-1 h-3.5 w-3.5" />
                  {t('theme.markoLight')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="marko-dark">
                  <GitGraph className="mr-1 h-3.5 w-3.5" />
                  {t('theme.markoDark')}
                </DropdownMenuRadioItem>
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
              <DropdownMenuSeparator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => onMenuAction('help.about')}
              >
                <CircleHelp className="mr-2 h-3.5 w-3.5" />
                About marko
              </Button>
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
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder={t('sidebar.search')} />
        <CommandList>
          <CommandEmpty>{t('center.noFile')}</CommandEmpty>
          {commandFiles.length > 0 && (
            <>
              <CommandGroup heading={t('command.files')}>
                {commandFiles.map((file) => (
                  <CommandItem
                    key={file.path}
                    value={`${file.label} ${file.path}`}
                    onSelect={() => onCommandOpenFile(file.path)}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="min-w-0">
                      <span className="block truncate">{file.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {file.path}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          {commandHeadings.length > 0 && (
            <>
              <CommandGroup heading={t('command.headings')}>
                {commandHeadings.map((heading) => (
                  <CommandItem
                    key={`${heading.path}#${heading.slug}`}
                    value={`${heading.text} ${heading.slug} ${heading.path}`}
                    onSelect={() => onCommandOpenHeading(heading.path, heading.slug)}
                  >
                    <ListTree className="h-4 w-4" />
                    <span className="min-w-0">
                      <span className="block truncate">
                        {'#'.repeat(Math.min(heading.level, 6))} {heading.text}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {heading.label}#{heading.slug}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="File">
            <CommandItem onSelect={() => onCommandAction('file.open_project')}>
              <FolderOpen className="h-4 w-4" />
              {t('actions.openProject')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('file.open_file')}>
              <FileText className="h-4 w-4" />
              {t('actions.openFile')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('view.focus_file_search')}>
              <Search className="h-4 w-4" />
              {t('sidebar.searchAction')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('file.export_pdf')}>
              <FileText className="h-4 w-4" />
              {t('actions.exportPdf')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('file.export_docx')}>
              <FileText className="h-4 w-4" />
              {t('actions.exportDocx')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('file.export_html')}>
              <FileText className="h-4 w-4" />
              {t('actions.exportHtml')}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="View">
            <CommandItem onSelect={() => onCommandAction('view.wysiwyg')}>
              <PenLine className="h-4 w-4" />
              {t('editor.modeWysiwyg')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('view.source')}>
              <FileText className="h-4 w-4" />
              {t('editor.modeSource')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('view.graph')}>
              <GitGraph className="h-4 w-4" />
              {t('tabs.workspaceGraph')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('view.toggle_sidebar')}>
              <PanelLeft className="h-4 w-4" />
              {t('actions.toggleSidebar')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('view.toggle_right_sidebar')}>
              <PanelRight className="h-4 w-4" />
              {t('actions.toggleRightSidebar')}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t('menu.theme')}>
            <CommandItem onSelect={() => onCommandAction('theme.light')}>
              {t('theme.light')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('theme.dark')}>
              {t('theme.dark')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('theme.marko-light')}>
              {t('theme.markoLight')}
            </CommandItem>
            <CommandItem onSelect={() => onCommandAction('theme.marko-dark')}>
              {t('theme.markoDark')}
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Help">
            <CommandItem onSelect={() => onCommandAction('help.about')}>
              <CircleHelp className="h-4 w-4" />
              About marko
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      {(platform === 'windows' || platform === 'linux') && isTauriRuntime() && (
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
      )}
    </header>
  )
}
