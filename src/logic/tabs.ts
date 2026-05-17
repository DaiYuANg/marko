import type { GitDiffSection, WorkspaceTab } from '@/store/useAppStore'

const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])

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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isGitDiffSection = (value: unknown): value is GitDiffSection =>
  typeof value === 'string' && GIT_DIFF_SECTIONS.has(value)

export const normalizeWorkspaceTabs = (value: unknown): WorkspaceTab[] => {
  if (!Array.isArray(value)) return []
  const tabs = value.flatMap((item): WorkspaceTab[] => {
    if (isNonEmptyString(item)) return [createFileTab(item)]
    if (!item || typeof item !== 'object') return []
    const tab = item as Partial<WorkspaceTab>
    if (tab.kind === 'file' && isNonEmptyString(tab.path)) {
      return [createFileTab(tab.path)]
    }
    if (tab.kind === 'git-diff' && isNonEmptyString(tab.path) && isGitDiffSection(tab.section)) {
      return [createGitDiffTab(tab.path, tab.section)]
    }
    return []
  })

  const deduped = new Map<string, WorkspaceTab>()
  for (const tab of tabs) {
    deduped.set(getWorkspaceTabId(tab), tab)
  }
  return Array.from(deduped.values())
}

export const normalizeWorkspaceTabId = (value: unknown, tabs: WorkspaceTab[]) => {
  if (typeof value !== 'string') return tabs[0] ? getWorkspaceTabId(tabs[0]) : null
  return tabs.some((tab) => getWorkspaceTabId(tab) === value)
    ? value
    : tabs[0]
      ? getWorkspaceTabId(tabs[0])
      : null
}
