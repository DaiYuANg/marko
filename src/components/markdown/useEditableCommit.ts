import {
  useCallback,
  useRef,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

export type UseEditableCommitOptions<T extends HTMLElement> = {
  value: string
  onCommit?: (value: string) => void
  readValue?: (element: T) => string
  normalizeValue?: (value: string) => string
  commitOnEnter?: boolean
  rejectEmpty?: boolean
  resetValue?: (element: T) => void
  resetOnEscape?: boolean
}

const defaultReadValue = <T extends HTMLElement>(element: T) => {
  return element.textContent ?? ''
}

export const useEditableCommit = <T extends HTMLElement>({
  value,
  onCommit,
  readValue = defaultReadValue,
  normalizeValue = (next) => next,
  commitOnEnter = false,
  rejectEmpty = false,
  resetValue,
  resetOnEscape = true,
}: UseEditableCommitOptions<T>) => {
  const composingRef = useRef(false)
  const pendingBlurTargetRef = useRef<T | null>(null)

  const commit = useCallback(
    (element: T) => {
      const next = normalizeValue(readValue(element))
      if (rejectEmpty && !next) {
        if (resetValue) {
          resetValue(element)
        } else {
          element.textContent = value
        }
        return
      }
      if (next === value) return
      onCommit?.(next)
    },
    [normalizeValue, onCommit, readValue, rejectEmpty, resetValue, value],
  )

  const onBlur = useCallback(
    (event: FocusEvent<T>) => {
      if (composingRef.current) {
        pendingBlurTargetRef.current = event.currentTarget
        return
      }
      commit(event.currentTarget)
    },
    [commit],
  )

  const onCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const onCompositionEnd = useCallback(
    (event: CompositionEvent<T>) => {
      composingRef.current = false
      if (pendingBlurTargetRef.current === event.currentTarget) {
        pendingBlurTargetRef.current = null
        commit(event.currentTarget)
      }
    },
    [commit],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<T>) => {
      event.stopPropagation()
      if (composingRef.current) return

      if (event.key === 'Escape') {
        event.preventDefault()
        if (resetOnEscape) {
          if (resetValue) {
            resetValue(event.currentTarget)
          } else {
            event.currentTarget.textContent = value
          }
        }
        event.currentTarget.blur()
        return
      }
      if (commitOnEnter && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        event.currentTarget.blur()
      }
    },
    [commitOnEnter, resetOnEscape, resetValue, value],
  )

  const onPointerDown = useCallback((event: PointerEvent<T>) => {
    event.stopPropagation()
  }, [])

  return {
    onBlur,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    onPointerDown,
  }
}
