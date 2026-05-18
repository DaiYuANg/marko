import { create } from 'zustand'

type MarkdownAssetSyncStore = {
  pending: number
  failed: number
  lastError: string | null
  markStarted: () => void
  markFinished: () => void
  markFailed: (message: string) => void
  clearFailures: () => void
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

export const useMarkdownAssetSyncStore = create<MarkdownAssetSyncStore>((set) => ({
  pending: 0,
  failed: 0,
  lastError: null,
  markStarted: () =>
    set((state) => ({
      pending: state.pending + 1,
      lastError: null,
    })),
  markFinished: () =>
    set((state) => ({
      pending: Math.max(0, state.pending - 1),
    })),
  markFailed: (lastError) =>
    set((state) => ({
      failed: state.failed + 1,
      lastError,
      pending: Math.max(0, state.pending - 1),
    })),
  clearFailures: () => set({ failed: 0, lastError: null }),
}))

export const beginMarkdownAssetSyncTask = () => {
  let completed = false
  useMarkdownAssetSyncStore.getState().markStarted()

  return (error?: unknown) => {
    if (completed) return
    completed = true
    if (error == null) {
      useMarkdownAssetSyncStore.getState().markFinished()
      return
    }
    useMarkdownAssetSyncStore.getState().markFailed(errorMessage(error))
  }
}
