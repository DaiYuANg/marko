import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { AlertTriangle, Loader2, RotateCcw, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import {
  terminalApi,
  terminalExitEventSchema,
  terminalOutputEventSchema,
  type TerminalSessionInfo,
} from '@/services/terminalApi'
import { isTauriRuntime } from '@/utils/tauri'

type TerminalStatus = 'connecting' | 'connected' | 'exited' | 'error' | 'unavailable'

type TerminalPanelProps = {
  onClose: () => void
}

function shellName(shell: string) {
  return shell.split(/[\\/]/).filter(Boolean).pop() ?? shell
}

export default function TerminalPanel({ onClose }: TerminalPanelProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const pendingOutputRef = useRef<Record<string, string[]>>({})
  const [session, setSession] = useState<TerminalSessionInfo | null>(null)
  const [status, setStatus] = useState<TerminalStatus>(
    isTauriRuntime() ? 'connecting' : 'unavailable',
  )
  const [error, setError] = useState<string | null>(null)
  const [restartKey, setRestartKey] = useState(0)
  const exitedLabel = t('terminal.exited')

  const closeSession = useCallback(() => {
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) void terminalApi.close(id).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    const container = containerRef.current
    if (!container) return

    let disposed = false
    let unlistenOutput: UnlistenFn | null = null
    let unlistenExit: UnlistenFn | null = null
    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1.24,
      scrollback: 10_000,
      theme: {
        background: '#101014',
        foreground: '#e6e6ea',
        cursor: '#ffffff',
        selectionBackground: '#4f46e540',
        black: '#17171c',
        blue: '#7aa2f7',
        cyan: '#7dcfff',
        green: '#9ece6a',
        magenta: '#bb9af7',
        red: '#f7768e',
        white: '#c0caf5',
        yellow: '#e0af68',
      },
    })
    const fitAddon = new FitAddon()
    const unicodeAddon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(unicodeAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.unicode.activeVersion = '11'
    terminal.open(container)
    fitAddon.fit()
    terminal.focus()

    const flushPendingOutput = (id: string) => {
      const pending = pendingOutputRef.current[id]
      if (!pending) return
      for (const chunk of pending) terminal.write(chunk)
      delete pendingOutputRef.current[id]
    }

    const resizeTerminal = () => {
      if (disposed) return
      fitAddon.fit()
      const id = sessionIdRef.current
      if (!id) return
      void terminalApi.resize(id, terminal.rows, terminal.cols).catch(() => undefined)
    }

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current)
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null
        resizeTerminal()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(container)
    const dataDisposable = terminal.onData((data) => {
      const id = sessionIdRef.current
      if (!id) return
      void terminalApi.write(id, data).catch((err) => {
        setError(String(err))
        setStatus('error')
      })
    })

    void import('@tauri-apps/api/event').then(({ listen }) => {
      if (disposed) return

      void listen<unknown>('terminal-output', (event) => {
        const payload = terminalOutputEventSchema.safeParse(event.payload)
        if (!payload.success) return

        const activeId = sessionIdRef.current
        if (activeId === payload.data.id) {
          terminal.write(payload.data.data)
          return
        }
        pendingOutputRef.current[payload.data.id] = [
          ...(pendingOutputRef.current[payload.data.id] ?? []),
          payload.data.data,
        ]
      }).then((unlisten) => {
        if (disposed) unlisten()
        else unlistenOutput = unlisten
      })

      void listen<unknown>('terminal-exit', (event) => {
        const payload = terminalExitEventSchema.safeParse(event.payload)
        if (!payload.success || sessionIdRef.current !== payload.data.id) return

        sessionIdRef.current = null
        setStatus('exited')
        terminal.writeln('')
        terminal.writeln(exitedLabel)
      }).then((unlisten) => {
        if (disposed) unlisten()
        else unlistenExit = unlisten
      })
    })

    setError(null)
    setStatus('connecting')
    void terminalApi
      .create(terminal.rows, terminal.cols)
      .then((nextSession) => {
        if (disposed) {
          void terminalApi.close(nextSession.id).catch(() => undefined)
          return
        }
        sessionIdRef.current = nextSession.id
        setSession(nextSession)
        setStatus('connected')
        flushPendingOutput(nextSession.id)
        scheduleResize()
        terminal.focus()
      })
      .catch((err) => {
        if (disposed) return
        setError(String(err))
        setStatus('error')
      })

    return () => {
      disposed = true
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      resizeObserver.disconnect()
      dataDisposable.dispose()
      unlistenOutput?.()
      unlistenExit?.()
      closeSession()
      terminal.dispose()
    }
  }, [closeSession, exitedLabel, restartKey])

  const restartTerminal = useCallback(() => {
    closeSession()
    setSession(null)
    setError(null)
    setStatus(isTauriRuntime() ? 'connecting' : 'unavailable')
    setRestartKey((value) => value + 1)
  }, [closeSession])

  const statusLabel =
    status === 'connected'
      ? t('terminal.connected')
      : status === 'connecting'
        ? t('terminal.connecting')
        : status === 'exited'
          ? t('terminal.exited')
          : status === 'unavailable'
            ? t('terminal.unavailable')
            : t('terminal.error')

  return (
    <TooltipProvider>
      <section className="terminal-panel flex shrink-0 flex-col border-t border-border/80">
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-2">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <TerminalIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{t('terminal.title')}</span>
            <span className="truncate text-muted-foreground">
              {session ? `${shellName(session.shell)} · ${session.cwd}` : statusLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {status === 'connecting' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {status === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {statusLabel}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={restartTerminal}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('terminal.restart')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onClose}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('terminal.close')}</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <div className="relative min-h-0 flex-1">
          <div ref={containerRef} className="h-full w-full" />
          {(status === 'error' || status === 'unavailable') && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 px-4 text-center text-sm text-muted-foreground backdrop-blur-sm">
              <div className="max-w-md">
                <p className="font-medium text-foreground">{statusLabel}</p>
                {error && <p className="mt-1 break-words text-xs">{error}</p>}
              </div>
            </div>
          )}
        </div>
      </section>
    </TooltipProvider>
  )
}
