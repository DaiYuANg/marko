import { generatePath } from 'react-router-dom'
import type { GitDiffSection } from '@/store/useAppStore'

const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])

export const FILE_ROUTE_PATTERN = '/*'
export const GIT_DIFF_ROUTE_PATTERN = '/_diff/:section/*'
export const SOURCE_ROUTE_PATTERN = '/_source/*'
export const GRAPH_FILE_ROUTE_PATTERN = '/_graph/file/*'
export const GRAPH_WORKSPACE_ROUTE_PATTERN = '/_graph/workspace'

export const pathToRoute = (path: string) => {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  return generatePath(FILE_ROUTE_PATTERN, { '*': trimmed })
}

export const pathToGitDiffRoute = (section: GitDiffSection, path: string) => {
  return generatePath(GIT_DIFF_ROUTE_PATTERN, { section, '*': path })
}

export const pathToSourceRoute = (path: string) => {
  return generatePath(SOURCE_ROUTE_PATTERN, { '*': path })
}

export const pathToGraphFileRoute = (path: string) => {
  return generatePath(GRAPH_FILE_ROUTE_PATTERN, { '*': path })
}

export const pathToWorkspaceGraphRoute = () => generatePath(GRAPH_WORKSPACE_ROUTE_PATTERN)

export const isGitDiffSection = (value: string | null | undefined): value is GitDiffSection =>
  Boolean(value && GIT_DIFF_SECTIONS.has(value))
