export const hasEditableFocus = (element: HTMLElement) => {
  const activeElement = document.activeElement
  return Boolean(activeElement && (activeElement === element || element.contains(activeElement)))
}

export const insertPlainTextAtSelection = (element: HTMLElement, text: string) => {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false

  const range = selection.getRangeAt(0)
  const anchor = range.commonAncestorContainer
  if (anchor !== element && !element.contains(anchor)) return false

  range.deleteContents()

  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)

  return true
}
