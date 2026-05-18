import { useEffect } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { focusHeadingInCrepe } from '@/components/milkdown/editorActions'
import { FOCUS_HEADING_EVENT, type FocusHeadingRequest } from '@/utils/editorNavigation'

type CrepeRef = {
  current: Crepe | null
}

export const useFocusHeadingEvent = (activePath: string | null, crepeRef: CrepeRef) => {
  useEffect(() => {
    const handler = (event: Event) => {
      const { path, slug } = (event as CustomEvent<FocusHeadingRequest>).detail ?? {}
      if (!path || !slug || path !== activePath) return

      const crepe = crepeRef.current
      if (!crepe) return

      focusHeadingInCrepe(crepe, slug)
    }

    window.addEventListener(FOCUS_HEADING_EVENT, handler)
    return () => window.removeEventListener(FOCUS_HEADING_EVENT, handler)
  }, [activePath, crepeRef])
}
