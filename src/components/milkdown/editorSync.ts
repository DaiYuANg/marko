import type {
  PendingExternalValue,
  ReplaceMarkdownOptions,
} from '@/components/milkdown/editorActions'

export type EditorLocalEcho = {
  path: string | null
  value: string
}

export type ExternalMarkdownSyncInput = {
  activePath: string | null
  currentMarkdown: string
  editorReady: boolean
  hasEditorFocus: boolean
  isComposing: boolean
  lastSyncedPath: string | null
  localEcho: EditorLocalEcho | null
  value: string
}

export type ExternalMarkdownSyncDecision =
  | {
      type: 'cache-unready'
      lastSyncedPath: string | null
      latestValue: string
    }
  | {
      type: 'replace'
      clearLocalEcho?: boolean
      clearPending?: boolean
      focus?: boolean
      lastSyncedPath: string | null
      replaceOptions?: ReplaceMarkdownOptions
      scrollToTop?: boolean
      value: string
    }
  | {
      type: 'accept'
      clearLocalEcho?: boolean
      lastSyncedPath: string | null
      latestValue: string
    }
  | {
      type: 'defer'
      pending: PendingExternalValue
    }
  | {
      type: 'ignore'
    }

export type PendingMarkdownSyncInput = {
  activePath: string | null
  currentMarkdown: string
  pending: PendingExternalValue | null
}

export type PendingMarkdownSyncDecision =
  | {
      type: 'idle'
    }
  | {
      type: 'accept'
      clearPending: true
      lastSyncedPath: string | null
      latestValue: string
    }
  | {
      type: 'replace'
      clearPending: true
      lastSyncedPath: string | null
      value: string
    }
  | {
      type: 'discard'
      clearPending: true
    }

export const resolveExternalMarkdownSync = ({
  activePath,
  currentMarkdown,
  editorReady,
  hasEditorFocus,
  isComposing,
  lastSyncedPath,
  localEcho,
  value,
}: ExternalMarkdownSyncInput): ExternalMarkdownSyncDecision => {
  if (!editorReady) {
    return {
      type: 'cache-unready',
      latestValue: value,
      lastSyncedPath: activePath,
    }
  }

  if (lastSyncedPath !== activePath) {
    return {
      type: 'replace',
      clearLocalEcho: true,
      clearPending: true,
      focus: Boolean(activePath),
      lastSyncedPath: activePath,
      replaceOptions: { preserveSelection: false },
      scrollToTop: true,
      value,
    }
  }

  if (localEcho?.path === activePath && localEcho.value === value) {
    return {
      type: 'accept',
      clearLocalEcho: true,
      latestValue: value,
      lastSyncedPath: activePath,
    }
  }

  if (currentMarkdown === value) {
    return {
      type: 'accept',
      latestValue: value,
      lastSyncedPath: activePath,
    }
  }

  if (isComposing || hasEditorFocus) {
    if (localEcho?.path === activePath && localEcho.value !== value) {
      return { type: 'ignore' }
    }

    return {
      type: 'defer',
      pending: {
        path: activePath,
        value,
        baseValue: currentMarkdown,
      },
    }
  }

  return {
    type: 'replace',
    clearPending: true,
    lastSyncedPath: activePath,
    value,
  }
}

export const resolvePendingMarkdownSync = ({
  activePath,
  currentMarkdown,
  pending,
}: PendingMarkdownSyncInput): PendingMarkdownSyncDecision => {
  if (!pending || pending.path !== activePath) {
    return { type: 'idle' }
  }

  if (currentMarkdown === pending.value) {
    return {
      type: 'accept',
      clearPending: true,
      latestValue: pending.value,
      lastSyncedPath: pending.path,
    }
  }

  if (currentMarkdown !== pending.baseValue) {
    return {
      type: 'discard',
      clearPending: true,
    }
  }

  return {
    type: 'replace',
    clearPending: true,
    lastSyncedPath: pending.path,
    value: pending.value,
  }
}
