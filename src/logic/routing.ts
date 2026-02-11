import type { FileEntry } from '@/store/useAppStore'
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

export function buildRouteMaps(entries: FileEntry[]): RouteMaps {
  const pathToSlug = new Map<string, string>()
  const slugToPath = new Map<string, string>()

  entries
    .filter((entry) => entry.kind === 'file')
    .forEach((entry) => {
      const base = slugify(createFileLabel(entry.path))
      let slug = base || hashPath(entry.path)
      if (slugToPath.has(slug)) {
        slug = `${slug}-${hashPath(entry.path).slice(0, 6)}`
      }
      pathToSlug.set(entry.path, slug)
      slugToPath.set(slug, entry.path)
    })

  return { pathToSlug, slugToPath }
}
