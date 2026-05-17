import { useEffect } from 'react'
import { isTauriRuntime } from '@/utils/tauri'

const READY_TIMEOUT_MS = 900

const nextFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

const waitForFirstStablePaint = async () => {
  await nextFrame()
  await nextFrame()

  const fonts = document.fonts
  if (!fonts) return

  await Promise.race([
    fonts.ready.then(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, READY_TIMEOUT_MS)
    }),
  ])
}

export function useTauriReadySignal() {
  useEffect(() => {
    if (!isTauriRuntime()) return

    let cancelled = false
    void waitForFirstStablePaint()
      .then(async () => {
        if (cancelled) return
        const { emit } = await import('@tauri-apps/api/event')
        if (!cancelled) {
          await emit('app-ready')
        }
      })
      .catch((error) => {
        console.error('emit app-ready failed', error)
      })

    return () => {
      cancelled = true
    }
  }, [])
}
