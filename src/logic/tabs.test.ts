import { describe, expect, it } from 'vitest'
import { getWorkspaceTabId, normalizeWorkspaceTabId, normalizeWorkspaceTabs } from '@/logic/tabs'

describe('normalizeWorkspaceTabs', () => {
  it('drops malformed git diff tabs and deduplicates valid tabs', () => {
    const tabs = normalizeWorkspaceTabs([
      { kind: 'git-diff' },
      { kind: 'git-diff', path: undefined, section: undefined },
      { kind: 'git-diff', path: 'README.md', section: 'unstaged' },
      { kind: 'git-diff', path: 'README.md', section: 'unstaged' },
      { kind: 'file', path: 'README.md' },
      { kind: 'file', path: '' },
    ])

    expect(tabs.map(getWorkspaceTabId)).toEqual(['git-diff:unstaged:README.md', 'file:README.md'])
  })
})

describe('normalizeWorkspaceTabId', () => {
  it('falls back to the first available tab when the active id is stale', () => {
    const tabs = normalizeWorkspaceTabs([
      { kind: 'file', path: 'README.md' },
      { kind: 'git-diff', path: 'README.md', section: 'unstaged' },
    ])

    expect(normalizeWorkspaceTabId('git-diff:undefined:undefined', tabs)).toBe('file:README.md')
  })
})
