import { describe, expect, it } from 'vitest'
import {
  resolveExternalMarkdownSync,
  resolvePendingMarkdownSync,
} from '@/components/milkdown/editorSync'

describe('resolveExternalMarkdownSync', () => {
  it('caches the external value while the editor is not ready', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '',
        editorReady: false,
        hasEditorFocus: false,
        isComposing: false,
        lastSyncedPath: null,
        localEcho: null,
        value: '# A',
      }),
    ).toEqual({
      type: 'cache-unready',
      latestValue: '# A',
      lastSyncedPath: 'notes/a.md',
    })
  })

  it('replaces content and resets viewport when the active path changes', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/b.md',
        currentMarkdown: '# A',
        editorReady: true,
        hasEditorFocus: true,
        isComposing: true,
        lastSyncedPath: 'notes/a.md',
        localEcho: { path: 'notes/a.md', value: '# A draft' },
        value: '# B',
      }),
    ).toEqual({
      type: 'replace',
      clearLocalEcho: true,
      clearPending: true,
      focus: true,
      lastSyncedPath: 'notes/b.md',
      replaceOptions: { preserveSelection: false },
      scrollToTop: true,
      value: '# B',
    })
  })

  it('accepts a matching local echo without replacing the editor document', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# A changed',
        editorReady: true,
        hasEditorFocus: false,
        isComposing: false,
        lastSyncedPath: 'notes/a.md',
        localEcho: { path: 'notes/a.md', value: '# A changed' },
        value: '# A changed',
      }),
    ).toEqual({
      type: 'accept',
      clearLocalEcho: true,
      latestValue: '# A changed',
      lastSyncedPath: 'notes/a.md',
    })
  })

  it('accepts external value that already matches the editor document', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# A',
        editorReady: true,
        hasEditorFocus: false,
        isComposing: false,
        lastSyncedPath: 'notes/a.md',
        localEcho: null,
        value: '# A',
      }),
    ).toEqual({
      type: 'accept',
      latestValue: '# A',
      lastSyncedPath: 'notes/a.md',
    })
  })

  it('defers an external update while the editor is focused', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# Local draft',
        editorReady: true,
        hasEditorFocus: true,
        isComposing: false,
        lastSyncedPath: 'notes/a.md',
        localEcho: null,
        value: '# Remote update',
      }),
    ).toEqual({
      type: 'defer',
      pending: {
        path: 'notes/a.md',
        value: '# Remote update',
        baseValue: '# Local draft',
      },
    })
  })

  it('ignores stale parent values while a local echo is newer', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# Local draft',
        editorReady: true,
        hasEditorFocus: true,
        isComposing: false,
        lastSyncedPath: 'notes/a.md',
        localEcho: { path: 'notes/a.md', value: '# Local draft' },
        value: '# Old saved value',
      }),
    ).toEqual({ type: 'ignore' })
  })

  it('replaces idle editor content when external value differs', () => {
    expect(
      resolveExternalMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# Local',
        editorReady: true,
        hasEditorFocus: false,
        isComposing: false,
        lastSyncedPath: 'notes/a.md',
        localEcho: null,
        value: '# External',
      }),
    ).toEqual({
      type: 'replace',
      clearPending: true,
      lastSyncedPath: 'notes/a.md',
      value: '# External',
    })
  })
})

describe('resolvePendingMarkdownSync', () => {
  it('stays idle when no pending value matches the active path', () => {
    expect(
      resolvePendingMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# A',
        pending: null,
      }),
    ).toEqual({ type: 'idle' })

    expect(
      resolvePendingMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# A',
        pending: {
          path: 'notes/b.md',
          value: '# B',
          baseValue: '# B draft',
        },
      }),
    ).toEqual({ type: 'idle' })
  })

  it('accepts pending value that already matches the editor document', () => {
    expect(
      resolvePendingMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# Remote',
        pending: {
          path: 'notes/a.md',
          value: '# Remote',
          baseValue: '# Local',
        },
      }),
    ).toEqual({
      type: 'accept',
      clearPending: true,
      latestValue: '# Remote',
      lastSyncedPath: 'notes/a.md',
    })
  })

  it('applies pending value when local content is unchanged from its base', () => {
    expect(
      resolvePendingMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# Local',
        pending: {
          path: 'notes/a.md',
          value: '# Remote',
          baseValue: '# Local',
        },
      }),
    ).toEqual({
      type: 'replace',
      clearPending: true,
      lastSyncedPath: 'notes/a.md',
      value: '# Remote',
    })
  })

  it('discards pending value when the user changed content after deferral', () => {
    expect(
      resolvePendingMarkdownSync({
        activePath: 'notes/a.md',
        currentMarkdown: '# New local draft',
        pending: {
          path: 'notes/a.md',
          value: '# Remote',
          baseValue: '# Old local draft',
        },
      }),
    ).toEqual({
      type: 'discard',
      clearPending: true,
    })
  })
})
