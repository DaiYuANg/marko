import { generatePath } from 'react-router-dom'
import type { FileViewKind, GitDiffSection } from '@/store/useAppStore'

const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])

export const FILE_ROUTE_PATTERN = '/files/edit/*'
export const GIT_DIFF_ROUTE_PATTERN = '/_diff/:section/*'
export const SOURCE_ROUTE_PATTERN = '/files/source/*'
export const GRAPH_FILE_ROUTE_PATTERN = '/files/graph/*'
export const GRAPH_WORKSPACE_ROUTE_PATTERN = '/workspace/graph'

export const fileViewToRoutePattern = (view: FileViewKind) => {
  if (view === 'source') return SOURCE_ROUTE_PATTERN
  if (view === 'graph') return GRAPH_FILE_ROUTE_PATTERN
  return FILE_ROUTE_PATTERN
}

export const pathToRoute = (path: string) => {
  return pathToFileViewRoute(path, 'edit')
}

export const pathToFileViewRoute = (path: string, view: FileViewKind) => {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  return generatePath(fileViewToRoutePattern(view), { '*': trimmed })
}

export const pathToGitDiffRoute = (section: GitDiffSection, path: string) => {
  return generatePath(GIT_DIFF_ROUTE_PATTERN, { section, '*': path })
}

export const pathToSourceRoute = (path: string) => {
  return pathToFileViewRoute(path, 'source')
}

export const pathToGraphFileRoute = (path: string) => {
  return pathToFileViewRoute(path, 'graph')
}

export const pathToWorkspaceGraphRoute = () => generatePath(GRAPH_WORKSPACE_ROUTE_PATTERN)

export const isGitDiffSection = (value: string | null | undefined): value is GitDiffSection =>
  Boolean(value && GIT_DIFF_SECTIONS.has(value))
