import { useMemo } from 'react'
import { useMatch, useParams } from 'react-router-dom'
import type { ViewMode } from '@/store/useAppStore'
import {
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
} from '@/logic/routing'
import { getWorkspaceTabPath } from '@/logic/tabs'
import type { WorkspaceTab } from '@/store/useAppStore'
import type { FileEntry } from '@/store/useAppStore'

type UseEditorRoutesArgs = {
  entries: FileEntry[]
  activeTab: WorkspaceTab | null
  tabViewModes: Record<string, ViewMode>
}

export function useEditorRoutes({ entries, activeTab, tabViewModes }: UseEditorRoutesArgs) {
  const params = useParams()
  const gitDiffMatch = useMatch(GIT_DIFF_ROUTE_PATTERN)
  const sourceMatch = useMatch(SOURCE_ROUTE_PATTERN)
  const graphFileMatch = useMatch(GRAPH_FILE_ROUTE_PATTERN)
  const graphWorkspaceMatch = useMatch(GRAPH_WORKSPACE_ROUTE_PATTERN)

  const routeSegment = params['*']
  const gitDiffSection = gitDiffMatch?.params.section
  const gitDiffPath = gitDiffMatch?.params['*'] || null
  const sourcePath = sourceMatch?.params['*'] || null
  const graphFilePath = graphFileMatch?.params['*'] || null
  const routePath = routeSegment || null
  const routeFilePath = sourcePath ?? graphFilePath
  const internalRouteActive = Boolean(
    gitDiffMatch || sourceMatch || graphFileMatch || graphWorkspaceMatch,
  )
  const isRouteFile = useMemo(
    () =>
      !internalRouteActive &&
      routePath !== null &&
      entries.some((entry) => entry.kind === 'file' && entry.path === routePath),
    [entries, internalRouteActive, routePath],
  )
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
  const currentFilePath = graphWorkspaceMatch ? null : (routeFilePath ?? activeFilePath)
  const activeResourcePath = graphWorkspaceMatch
    ? getWorkspaceTabPath(activeTab)
    : (routeFilePath ?? getWorkspaceTabPath(activeTab))
  const viewMode: ViewMode = sourceMatch
    ? 'source'
    : graphFileMatch || graphWorkspaceMatch
      ? 'graph'
      : currentFilePath
        ? (tabViewModes[currentFilePath] ?? 'wysiwyg')
        : 'wysiwyg'

  return {
    gitDiffMatch,
    sourceMatch,
    graphFileMatch,
    graphWorkspaceMatch,
    gitDiffSection,
    gitDiffPath,
    routeFilePath,
    routePath,
    internalRouteActive,
    isRouteFile,
    currentFilePath,
    activeResourcePath,
    viewMode,
  }
}
