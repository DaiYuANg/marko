import { memo, useCallback, type HTMLAttributes, type Ref } from 'react'
import { useEditableDom } from '@/components/markdown/useEditableDom'
import type { UseEditableCommitOptions } from '@/components/markdown/useEditableCommit'
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
    'commitOnEnter' | 'normalizeValue' | 'readValue' | 'rejectEmpty'
  > & {
    as?: EditableTagName
    editable?: boolean
    onCommit?: (value: string) => void
    value: string
  }

const defaultReadValue = (element: HTMLElement) => element.textContent ?? ''

const syncElementText = (
  element: HTMLElement,
  value: string,
  readValue: (element: HTMLElement) => string,
) => {
  if (readValue(element) === value) return
  element.textContent = value
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
  value,
  ...props
}: MarkdownEditableTextProps) => {
  const syncValue = useCallback(
    (element: HTMLElement) => syncElementText(element, value, readValue),
    [readValue, value],
  )
  const { editableProps, setElementRef } = useEditableDom<HTMLElement>({
    editable,
    value,
    onCommit,
    readValue,
    normalizeValue,
    commitOnEnter,
    rejectEmpty,
    syncValue,
  })

  const sharedProps = {
    ...props,
    ...editableProps,
    className: cn(className),
  }

  if (as === 'code') {
    return <code ref={setElementRef as Ref<HTMLElement>} {...sharedProps} />
  }

  return <div ref={setElementRef as Ref<HTMLDivElement>} {...sharedProps} />
}

export default memo(MarkdownEditableText)
