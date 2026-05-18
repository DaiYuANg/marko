const EDITOR_CHROME_SELECTOR = [
  '.milkdown-toolbar',
  '.milkdown-link-preview',
  '.milkdown-link-edit',
  '.milkdown-slash-menu',
  '.milkdown-code-block',
].join(', ')

export const containsActiveElement = (root: HTMLElement | null) => {
  return Boolean(root && document.activeElement && root.contains(document.activeElement))
}

export const isEditorChromeTarget = (target: HTMLElement) => {
  return Boolean(target.closest('.ProseMirror') || target.closest(EDITOR_CHROME_SELECTOR))
}

export const scrollEditorViewportToTop = (scrollArea: HTMLElement | null) => {
  const viewport = scrollArea?.querySelector<HTMLElement>('.editor-scroll-viewport')
  viewport?.scrollTo({ top: 0 })
}
