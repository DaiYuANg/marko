import type { MarkdownFile } from '@/store/useAppStore'
import { createFileLabel, slugify } from '@/logic/paths'

export type RouteMaps = {
  pathToSlug: Map<string, string>
  slugToPath: Map<string, string>
}

function hashPath(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function buildRouteMaps(files: MarkdownFile[]): RouteMaps {
  const pathToSlug = new Map<string, string>()
  const slugToPath = new Map<string, string>()

  files.forEach((file) => {
    const base = slugify(createFileLabel(file.relative_path))
    let slug = base || hashPath(file.relative_path)
    if (slugToPath.has(slug)) {
      slug = `${slug}-${hashPath(file.relative_path).slice(0, 6)}`
    }
    pathToSlug.set(file.relative_path, slug)
    slugToPath.set(slug, file.relative_path)
  })

  return { pathToSlug, slugToPath }
}
