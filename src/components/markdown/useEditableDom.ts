import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FocusEvent,
  type HTMLAttributes,
} from 'react'
import { hasEditableFocus, insertPlainTextAtSelection } from '@/components/markdown/editableDom'
import {
  useEditableCommit,
  type UseEditableCommitOptions,
} from '@/components/markdown/useEditableCommit'

type UseEditableDomOptions<T extends HTMLElement> = Pick<
  UseEditableCommitOptions<T>,
  'commitOnEnter' | 'normalizeValue' | 'readValue' | 'rejectEmpty'
> & {
  editable: boolean
  onCommit?: (value: string) => void
  syncValue: (element: T) => void
  value: string
}

const defaultReadValue = <T extends HTMLElement>(element: T) => element.textContent ?? ''

export const useEditableDom = <T extends HTMLElement>({
  commitOnEnter,
  editable,
  normalizeValue,
  onCommit,
  readValue,
  rejectEmpty,
  syncValue,
  value,
}: UseEditableDomOptions<T>) => {
  const elementRef = useRef<T | null>(null)
  const focusedBaseValueRef = useRef<string | null>(null)
  const pendingFocusedValueRef = useRef<string | null>(null)
  const readElementValue = readValue ?? defaultReadValue
  const editableHandlers = useEditableCommit<T>({
    value,
    onCommit,
    readValue: readElementValue,
    normalizeValue,
    commitOnEnter,
    rejectEmpty,
    resetValue: syncValue,
    resetOnEscape: true,
  })

  const setElementRef = useCallback(
    (element: T | null) => {
      elementRef.current = element
      if (!element || hasEditableFocus(element)) return
      syncValue(element)
    },
    [syncValue],
  )

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    if (hasEditableFocus(element)) {
      pendingFocusedValueRef.current = value
      return
    }
    syncValue(element)
    pendingFocusedValueRef.current = null
  }, [syncValue, value])

  const handleFocus = useCallback(
    (event: FocusEvent<T>) => {
      focusedBaseValueRef.current = readElementValue(event.currentTarget)
      pendingFocusedValueRef.current = null
    },
    [readElementValue],
  )

  const handleBlur = useCallback(
    (event: FocusEvent<T>) => {
      const pendingValue = pendingFocusedValueRef.current
      const focusedBaseValue = focusedBaseValueRef.current
      if (pendingValue !== null && focusedBaseValue === readElementValue(event.currentTarget)) {
        syncValue(event.currentTarget)
      }

      focusedBaseValueRef.current = null
      pendingFocusedValueRef.current = null
      editableHandlers.onBlur(event)
    },
    [editableHandlers, readElementValue, syncValue],
  )

  const handlePaste = useCallback((event: ClipboardEvent<T>) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text || !insertPlainTextAtSelection(event.currentTarget, text)) return
    event.preventDefault()
  }, [])

  const contentEditable: HTMLAttributes<T>['contentEditable'] = editable ? 'plaintext-only' : false

  return {
    editableProps: {
      ...(editable
        ? {
            ...editableHandlers,
            onBlur: handleBlur,
            onFocus: handleFocus,
            onPaste: handlePaste,
          }
        : {}),
      contentEditable,
      spellCheck: editable,
      suppressContentEditableWarning: true,
    },
    setElementRef,
  }
}
