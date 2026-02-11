import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import type { CodemirrorProps } from '@/playground/codemirror'
import { Codemirror } from '@/playground/codemirror'
import { crepeAPI } from '@/playground/atom'

type ControlPanelProps = CodemirrorProps & {
  hide: boolean
  setHide: (hide: boolean) => void
}

export default function ControlPanel({ hide, onChange, setHide }: ControlPanelProps) {
  const { onShare } = useAtomValue(crepeAPI)

  if (hide) {
    return (
      <div className="absolute right-6 top-6 flex flex-col gap-2">
        <button
          onClick={() => {
            setHide(false)
          }}
          className={clsx(
            'flex h-12 w-12 items-center justify-center rounded-sm',
            'bg-muted/70 hover:bg-muted',
          )}
        >
          <span className="material-symbols-outlined text-2xl">chevron_left</span>
        </button>

        <button
          onClick={() => onShare()}
          className={clsx(
            'flex h-12 w-12 items-center justify-center rounded-sm',
            'bg-muted/70 hover:bg-muted',
          )}
        >
          <span className="material-symbols-outlined text-base">share</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center justify-between border-b border-border bg-muted/60 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHide(true)}
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-full',
              'hover:bg-muted',
            )}
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
          <div className="flex items-center gap-2">
            <span>Milkdown Playground</span>
            <span className="font-mono text-xs text-muted-foreground">v7.18.0</span>
          </div>
        </div>
        <button
          onClick={() => onShare()}
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-full',
            'hover:bg-muted',
          )}
        >
          <span className="material-symbols-outlined text-base">share</span>
        </button>
      </div>
      <Codemirror onChange={onChange} />
    </div>
  )
}
