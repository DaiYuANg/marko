import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  terminalApi,
  terminalExitEventSchema,
  terminalOutputEventSchema,
  type TerminalSessionInfo,
} from '@/services/terminalApi'
import type { ThemeMode } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { isTauriRuntime } from '@/utils/tauri'
import { readTerminalTheme } from '@/components/terminal/terminalTheme'

export type TerminalStatus = 'connecting' | 'connected' | 'exited' | 'error' | 'unavailable'

export type TerminalRuntimeState = {
  session: TerminalSessionInfo | null
  status: TerminalStatus
  error: string | null
}

type TerminalSessionPaneProps = {
  active: boolean
  exitedLabel: string
  restartKey: number
  statusLabel: string
  tabKey: string
  theme: ThemeMode
  onStateChange: (tabKey: string, state: TerminalRuntimeState) => void
}

function applyTerminalTheme(terminal: Terminal) {
  terminal.options.theme = readTerminalTheme()
  if (terminal.rows > 0) terminal.refresh(0, terminal.rows - 1)
}

export default function TerminalSessionPane({
  active,
  exitedLabel,
  restartKey,
  statusLabel,
  tabKey,
  theme,
  onStateChange,
}: TerminalSessionPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const activeRef = useRef(active)
  const resizeFrameRef = useRef<number | null>(null)
  const pendingOutputRef = useRef<Record<string, string[]>>({})
  const [session, setSession] = useState<TerminalSessionInfo | null>(null)
  const [status, setStatus] = useState<TerminalStatus>(
    isTauriRuntime() ? 'connecting' : 'unavailable',
  )
  const [error, setError] = useState<string | null>(null)

  const closeSession = useCallback(() => {
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) void terminalApi.close(id).catch(() => undefined)
  }, [])

  const fitAndFocusTerminal = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) return

    fitAddon.fit()
    const id = sessionIdRef.current
    if (id) void terminalApi.resize(id, terminal.rows, terminal.cols).catch(() => undefined)
    terminal.focus()
  }, [])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    onStateChange(tabKey, { session, status, error })
  }, [error, onStateChange, session, status, tabKey])

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
      theme: readTerminalTheme(),
    })
    const fitAddon = new FitAddon()
    const unicodeAddon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(unicodeAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.unicode.activeVersion = '11'
    terminal.open(container)
    fitAddon.fit()
    if (activeRef.current) terminal.focus()

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

        const currentId = sessionIdRef.current
        if (currentId === payload.data.id) {
          terminal.write(payload.data.data)
          return
        }
        if (!currentId) {
          pendingOutputRef.current[payload.data.id] = [
            ...(pendingOutputRef.current[payload.data.id] ?? []),
            payload.data.data,
          ]
        }
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

    setSession(null)
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
        if (activeRef.current) terminal.focus()
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
      fitAddonRef.current = null
      terminalRef.current = null
    }
  }, [closeSession, exitedLabel, restartKey])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    const frame = window.requestAnimationFrame(() => {
      applyTerminalTheme(terminal)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [theme])

  useEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(fitAndFocusTerminal)
    return () => window.cancelAnimationFrame(frame)
  }, [active, fitAndFocusTerminal])

  return (
    <div
      aria-hidden={!active}
      className={cn(
        'absolute inset-0 min-h-0 bg-background',
        active ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0',
      )}
    >
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
  )
}
