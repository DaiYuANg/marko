import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type HTMLAttributes,
  type Ref,
} from 'react'
import {
  useEditableCommit,
  type UseEditableCommitOptions,
} from '@/components/markdown/useEditableCommit'
import { cn } from '@/lib/utils'

type EditableTagName = 'code' | 'div'

type MarkdownEditableTextProps = Omit<
  HTMLAttributes<HTMLElement>,
  | 'children'
  | 'contentEditable'
  | 'dangerouslySetInnerHTML'
  | 'onBlur'
  | 'onCompositionEnd'
  | 'onCompositionStart'
  | 'onKeyDown'
  | 'onPaste'
  | 'onPointerDown'
> &
  Pick<
    UseEditableCommitOptions<HTMLElement>,
    'commitOnEnter' | 'normalizeValue' | 'readValue' | 'rejectEmpty' | 'resetOnEscape'
  > & {
    as?: EditableTagName
    editable?: boolean
    onCommit?: (value: string) => void
    value: string
  }

const defaultReadValue = (element: HTMLElement) => element.textContent ?? ''

const isFocused = (element: HTMLElement) => document.activeElement === element

const syncElementText = (
  element: HTMLElement,
  value: string,
  readValue: (element: HTMLElement) => string,
) => {
  if (readValue(element) === value) return
  element.textContent = value
}

const insertPlainTextAtSelection = (element: HTMLElement, text: string) => {
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

const MarkdownEditableText = ({
  as = 'div',
  className,
  commitOnEnter,
  editable = false,
  normalizeValue,
  onCommit,
  readValue = defaultReadValue,
  rejectEmpty,
  resetOnEscape,
  value,
  ...props
}: MarkdownEditableTextProps) => {
  const elementRef = useRef<HTMLElement | null>(null)
  const editableHandlers = useEditableCommit<HTMLElement>({
    value,
    onCommit,
    readValue,
    normalizeValue,
    commitOnEnter,
    rejectEmpty,
    resetOnEscape,
  })

  const setElementRef = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element
      if (!element || isFocused(element)) return
      syncElementText(element, value, readValue)
    },
    [readValue, value],
  )

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element || isFocused(element)) return
    syncElementText(element, value, readValue)
  }, [readValue, value])

  const handlePaste = useCallback((event: ClipboardEvent<HTMLElement>) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text || !insertPlainTextAtSelection(event.currentTarget, text)) return
    event.preventDefault()
  }, [])

  const contentEditable: HTMLAttributes<HTMLElement>['contentEditable'] = editable
    ? 'plaintext-only'
    : false
  const sharedProps = {
    ...props,
    ...(editable ? { ...editableHandlers, onPaste: handlePaste } : {}),
    className: cn(className),
    contentEditable,
    spellCheck: editable,
    suppressContentEditableWarning: true,
  }

  if (as === 'code') {
    return <code ref={setElementRef as Ref<HTMLElement>} {...sharedProps} />
  }

  return <div ref={setElementRef as Ref<HTMLDivElement>} {...sharedProps} />
}

export default memo(MarkdownEditableText)
