import type { MarkdownFile } from '@/store/useAppStore'

export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
}

export function buildFileTree(files: MarkdownFile[]) {
  const root: FileTreeNode = { name: 'root', path: '', type: 'folder', children: [] }

  files.forEach((file) => {
    const parts = file.relative_path.split('/')
    let current = root
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      if (!current.children) current.children = []
      let next = current.children.find((child) => child.name === part)
      if (!next) {
        next = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
        }
        current.children.push(next)
      }
      current = next
    })
  })

  return root.children ?? []
}
