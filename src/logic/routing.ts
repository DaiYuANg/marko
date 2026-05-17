import type { GitDiffSection } from '@/store/useAppStore'

const GIT_DIFF_ROUTE_PREFIX = '_diff'
const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])

const encodeSegment = (value: string) => {
  return encodeURIComponent(value)
}

const decodeSegment = (value: string) => {
  return decodeURIComponent(value)
}

export const pathToRoute = (path: string) => {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  const encoded = trimmed.split('/').filter(Boolean).map(encodeSegment).join('/')
  return encoded ? `/${encoded}` : '/'
}

export const routeToPath = (route: string | null | undefined) => {
  const normalized = (route ?? '').replace(/^\/+|\/+$/g, '')
  if (!normalized) return null
  try {
    return normalized.split('/').filter(Boolean).map(decodeSegment).join('/')
  } catch {
    return null
  }
}

export const pathToGitDiffRoute = (section: GitDiffSection, path: string) => {
  const fileRoute = pathToRoute(path)
  return `/${GIT_DIFF_ROUTE_PREFIX}/${section}${fileRoute === '/' ? '' : fileRoute}`
}

export const routeToGitDiff = (route: string | null | undefined) => {
  const segments = (route ?? '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  if (segments[0] !== GIT_DIFF_ROUTE_PREFIX) return null
  const section = segments[1]
  if (!GIT_DIFF_SECTIONS.has(section)) return null
  const path = routeToPath(segments.slice(2).join('/'))
  if (!path) return null
  return {
    section: section as GitDiffSection,
    path,
  }
}

export const isGitDiffRoute = (route: string | null | undefined) => routeToGitDiff(route) !== null
