import { atom } from 'jotai'

export const markdown = atom<string>('')

export const crepeAPI = atom<{
  loaded: boolean
  onShare: () => void
  update: (markdown: string) => void
  getMarkdown: () => string
}>({
  loaded: false,
  onShare: () => {},
  update: () => {},
  getMarkdown: () => '',
})

export const cmAPI = atom<{
  loaded: boolean
  update: (markdown: string) => void
}>({
  loaded: false,
  update: () => {},
})

export type FocusType = 'crepe' | 'cm' | null
export const focus = atom<FocusType>(null)
