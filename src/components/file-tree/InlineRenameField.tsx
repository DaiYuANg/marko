import { useEffect, useRef } from 'react'
import type { NodeApi } from 'react-arborist'
import type { FileTreeNode } from '@/logic/fileTree'

export const InlineRenameField = ({ node }: { node: NodeApi<FileTreeNode> }) => {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = () => {
    const nextName = inputRef.current?.value.trim() ?? ''
    if (!nextName || nextName === node.data.name || nextName.includes('/')) {
      node.reset()
      return
    }
    void node.submit(nextName)
  }

  return (
    <input
      ref={inputRef}
      defaultValue={node.data.name}
      className="ml-1 h-5 min-w-0 flex-1 rounded border border-ring bg-background px-1 text-xs text-foreground outline-none"
      onBlur={submit}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          node.reset()
          return
        }
        if (event.key === 'Enter') {
          submit()
        }
      }}
    />
  )
}
