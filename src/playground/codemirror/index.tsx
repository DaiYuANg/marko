import { useAtomValue, useSetAtom } from 'jotai'
import { useLayoutEffect, useRef } from 'react'
import { useDarkMode } from '@/hooks/useDarkMode'
import { cmAPI, markdown, focus } from '@/playground/atom'
import { createCodeMirrorState, createCodeMirrorView } from '@/playground/codemirror/setup'

export interface CodemirrorProps {
  onChange: (getString: () => string) => void
}

export function Codemirror({ onChange }: CodemirrorProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const dark = useDarkMode()
  const content = useAtomValue(markdown)
  const setCmAPI = useSetAtom(cmAPI)
  const setFocus = useSetAtom(focus)

  useLayoutEffect(() => {
    if (!divRef.current) return

    const editor = createCodeMirrorView({
      root: divRef.current,
      onChange,
      setFocus,
      content,
      dark,
    })

    setCmAPI({
      loaded: true,
      update: (markdown: string) => {
        const state = createCodeMirrorState({
          onChange,
          setFocus,
          dark,
          content: markdown,
        })
        editor.setState(state)
      },
    })

    return () => {
      editor.destroy()
      setCmAPI({
        loaded: false,
        update: () => {},
      })
    }
  }, [onChange, content, dark, setCmAPI, setFocus])

  return (
    <div
      className="playground-cm flex-1 overflow-y-scroll overscroll-none bg-muted/40"
      ref={divRef}
    />
  )
}
