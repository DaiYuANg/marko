import { useCallback, useEffect } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Dual } from '@/playground'
import { cmAPI, crepeAPI, markdown } from '@/playground/atom'

type EditorPageProps = {
  activePath: string | null
  editorValue: string
  onChange: (value: string) => void
}

export default function EditorPage({ activePath, editorValue, onChange }: EditorPageProps) {
  const [value, setValue] = useAtom(markdown)
  const crepe = useAtomValue(crepeAPI)
  const cm = useAtomValue(cmAPI)
  const handleMarkdownChange = useCallback(
    (nextValue: string) => {
      onChange(nextValue)
    },
    [onChange],
  )

  useEffect(() => {
    if (!activePath) return
    if (editorValue !== value) {
      setValue(editorValue)
    }
  }, [activePath, editorValue, setValue, value])

  useEffect(() => {
    if (!activePath) return
    if (crepe.loaded) {
      crepe.update(editorValue)
    }
    if (cm.loaded) {
      cm.update(editorValue)
    }
  }, [activePath, cm, crepe, editorValue])

  return (
    <div className="h-full overflow-hidden">
      {activePath ? (
        <Dual
          onMarkdownChange={handleMarkdownChange}
        />
      ) : (
        <div className="text-sm text-muted-foreground">请选择或打开一个文件</div>
      )}
    </div>
  )
}
