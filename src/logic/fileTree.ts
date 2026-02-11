import type { FileEntry } from '@/store/useAppStore'

export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
}

export function buildFileTree(entries: FileEntry[]) {
  const root: FileTreeNode = { name: 'root', path: '', type: 'folder', children: [] }

  entries.forEach((entry) => {
    const parts = entry.path.split('/')
    let current = root
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      if (!current.children) current.children = []
      let next = current.children.find((child) => child.name === part)
      if (!next) {
        next = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: isFile ? entry.kind : 'folder',
          children: isFile ? undefined : [],
        }
        current.children.push(next)
      }
      current = next
    })
  })

  return root.children ?? []
}
