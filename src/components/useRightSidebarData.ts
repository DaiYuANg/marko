import { useDeferredValue, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWorkspaceMarkdownContents } from '@/app/useWorkspaceMarkdownContents'
import { getMarkdownSourceDiagnostics } from '@/logic/markdownDiagnostics'
import {
  createFileLabel,
  extractHeadings,
  extractLinks,
  isExternalLink,
  resolveRelativePath,
  splitLinkTarget,
} from '@/logic/paths'
import { fsApi, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { isTauriRuntime } from '@/utils/tauri'
import type { SidebarBacklink } from '@/components/RightSidebarContent'

type UseRightSidebarDataArgs = {
  collapsed: boolean
  activePath: string | null
  targetPath: string | null
  editorValue: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

export function useRightSidebarData({
  collapsed,
  activePath,
  targetPath,
  editorValue,
  files,
  fileContents,
  workspaceIndex,
}: UseRightSidebarDataArgs) {
  const tauriAvailable = isTauriRuntime()
  const deferredEditorValue = useDeferredValue(editorValue)
  const deferredFileContents = useDeferredValue(fileContents)
  const deferredTargetPath = useDeferredValue(targetPath)
  const metadataQuery = useQuery({
    queryKey: ['path-metadata', targetPath],
    queryFn: () => fsApi.getPathMetadata(targetPath ?? ''),
    enabled: !collapsed && tauriAvailable && Boolean(targetPath),
    staleTime: 10_000,
  })
  const displayMetadata = useMemo(() => {
    if (!targetPath) return null
    if (!tauriAvailable) {
      return {
        path: targetPath,
        absolute_path: targetPath,
        kind: 'file' as const,
        size_bytes: 0,
        readonly: false,
      }
    }
    const metadata = metadataQuery.data
    if (!metadata || metadata.path !== targetPath) return null
    return metadata
  }, [metadataQuery.data, targetPath, tauriAvailable])
  const indexedFilesByPath = useMemo(() => {
    if (!workspaceIndex) return null
    return new Map(workspaceIndex.files.map((file) => [file.path, file]))
  }, [workspaceIndex])
  const indexedTargetFile = deferredTargetPath
    ? indexedFilesByPath?.get(deferredTargetPath)
    : undefined
  const workspaceContents = useWorkspaceMarkdownContents(
    files,
    deferredFileContents,
    !collapsed && !workspaceIndex,
  )
  const targetContent = useMemo(() => {
    if (collapsed) return ''
    if (!deferredTargetPath) return ''
    if (deferredTargetPath === activePath) return deferredEditorValue
    return workspaceContents[deferredTargetPath] ?? ''
  }, [activePath, collapsed, deferredEditorValue, deferredTargetPath, workspaceContents])
  const outline = useMemo(() => {
    if (collapsed) return []
    if (deferredTargetPath && deferredTargetPath !== activePath && indexedTargetFile) {
      return indexedTargetFile.headings
    }
    return extractHeadings(targetContent)
  }, [activePath, collapsed, deferredTargetPath, indexedTargetFile, targetContent])
  const backlinks = useMemo<SidebarBacklink[]>(() => {
    if (collapsed) return []
    if (!deferredTargetPath) return []

    if (workspaceIndex) {
      return workspaceIndex.files.flatMap((file) => {
        if (file.path === deferredTargetPath) return []
        return file.links
          .filter((link) => !link.is_external && link.target_path === deferredTargetPath)
          .map((link) => ({
            sourcePath: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
          }))
      })
    }

    const nameIndex = new Map<string, string>()
    files
      .filter((file) => file.kind === 'file')
      .forEach((file) => {
        nameIndex.set(createFileLabel(file.path).toLowerCase(), file.path)
      })

    const results: SidebarBacklink[] = []
    files
      .filter((file) => file.kind === 'file' && file.path !== deferredTargetPath)
      .forEach((file) => {
        const content =
          file.path === activePath ? deferredEditorValue : (workspaceContents[file.path] ?? '')
        extractLinks(content).forEach((link) => {
          const linkedPath = normalizeLinkedPath(file.path, link, nameIndex)
          if (linkedPath !== deferredTargetPath) return
          results.push({
            sourcePath: file.path,
            text: link.text || link.target,
            context: link.context,
            line: link.line,
            column: link.column,
          })
        })
      })
    return results
  }, [
    activePath,
    collapsed,
    deferredEditorValue,
    deferredTargetPath,
    files,
    workspaceContents,
    workspaceIndex,
  ])
  const problems = useMemo(() => {
    if (collapsed) return []
    return getMarkdownSourceDiagnostics({
      activePath: deferredTargetPath,
      content: targetContent,
      files,
      fileContents: workspaceContents,
      workspaceIndex,
    })
  }, [collapsed, files, workspaceIndex, deferredTargetPath, targetContent, workspaceContents])
  const documentStats = useMemo(() => getDocumentStats(targetContent), [targetContent])
  const outgoingLinkCount = useMemo(() => {
    if (collapsed) return 0
    if (!deferredTargetPath) return 0
    if (deferredTargetPath !== activePath && indexedTargetFile) {
      return indexedTargetFile.links.filter((link) => !link.is_external).length
    }
    return extractLinks(targetContent).filter((link) => !isExternalLink(link.target)).length
  }, [activePath, collapsed, deferredTargetPath, indexedTargetFile, targetContent])
  const errorProblems = useMemo(
    () => problems.filter((problem) => problem.severity === 'error'),
    [problems],
  )
  const warningProblems = useMemo(
    () => problems.filter((problem) => problem.severity !== 'error'),
    [problems],
  )

  return {
    outline,
    backlinks,
    problems,
    errorProblems,
    warningProblems,
    documentStats,
    outgoingLinkCount,
    displayMetadata,
    loadingMetadata: metadataQuery.isFetching && !metadataQuery.data,
  }
}

const normalizeLinkedPath = (
  sourcePath: string,
  link: ReturnType<typeof extractLinks>[number],
  nameIndex: Map<string, string>,
) => {
  if (isExternalLink(link.target)) return null

  const { path: linkPath } = splitLinkTarget(link.target)
  if (link.type === 'wiki') {
    return nameIndex.get(linkPath.toLowerCase()) ?? `${linkPath}.md`
  }

  if (linkPath.trim().length === 0) {
    return sourcePath
  }

  const normalized = resolveRelativePath(sourcePath, linkPath)
  if (!normalized) return null
  return normalized.endsWith('.md') || normalized.endsWith('.markdown')
    ? normalized
    : `${normalized}.md`
}

const getDocumentStats = (value: string) => {
  const trimmed = value.trim()
  return {
    lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length,
  }
}
