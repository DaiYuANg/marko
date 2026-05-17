import type { GitDiffSection, WorkspaceTab } from '@/store/useAppStore'

export const fileTabId = (path: string) => `file:${path}`

export const gitDiffTabId = (section: GitDiffSection, path: string) => `git-diff:${section}:${path}`

export const getWorkspaceTabId = (tab: WorkspaceTab) =>
  tab.kind === 'file' ? fileTabId(tab.path) : gitDiffTabId(tab.section, tab.path)

export const createFileTab = (path: string): WorkspaceTab => ({ kind: 'file', path })

export const createGitDiffTab = (path: string, section: GitDiffSection): WorkspaceTab => ({
  kind: 'git-diff',
  path,
  section,
})

export const getWorkspaceTabPath = (tab: WorkspaceTab | null | undefined) => tab?.path ?? null

export const getWorkspaceTabLabelPath = (tab: WorkspaceTab) => tab.path

export const areWorkspaceTabsEqual = (left: WorkspaceTab[], right: WorkspaceTab[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((tab, index) => getWorkspaceTabId(tab) === getWorkspaceTabId(right[index]))
}

export const normalizeWorkspaceTabs = (value: unknown): WorkspaceTab[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): WorkspaceTab[] => {
    if (typeof item === 'string') return [createFileTab(item)]
    if (!item || typeof item !== 'object') return []
    const tab = item as Partial<WorkspaceTab>
    if (tab.kind === 'file' && typeof tab.path === 'string') {
      return [createFileTab(tab.path)]
    }
    if (
      tab.kind === 'git-diff' &&
      typeof tab.path === 'string' &&
      (tab.section === 'staged' ||
        tab.section === 'unstaged' ||
        tab.section === 'untracked' ||
        tab.section === 'conflicts')
    ) {
      return [createGitDiffTab(tab.path, tab.section)]
    }
    return []
  })
}
