export type FocusHeadingRequest = {
  path: string
  slug: string
}

export type FocusSourcePositionRequest = {
  path: string
  line: number
  column: number
  endColumn?: number
}

export const FOCUS_HEADING_EVENT = 'marko:focus-heading'
export const FOCUS_SOURCE_POSITION_EVENT = 'marko:focus-source-position'

export function requestFocusHeading(request: FocusHeadingRequest) {
  window.dispatchEvent(
    new CustomEvent<FocusHeadingRequest>(FOCUS_HEADING_EVENT, { detail: request }),
  )
}

export function requestFocusSourcePosition(request: FocusSourcePositionRequest) {
  window.dispatchEvent(
    new CustomEvent<FocusSourcePositionRequest>(FOCUS_SOURCE_POSITION_EVENT, { detail: request }),
  )
}
