import { useEffect } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { focusHeadingInCrepe } from '@/components/milkdown/editorActions'
import { onFocusHeadingRequest } from '@/utils/editorNavigation'

type CrepeRef = {
  current: Crepe | null
}

export const useFocusHeadingEvent = (activePath: string | null, crepeRef: CrepeRef) => {
  useEffect(() => {
    return onFocusHeadingRequest(({ path, slug }) => {
      if (!path || !slug || path !== activePath) return

      const crepe = crepeRef.current
      if (!crepe) return

      focusHeadingInCrepe(crepe, slug)
    })
  }, [activePath, crepeRef])
}
