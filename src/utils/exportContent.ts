/** Custom event for requesting the current editor content for export. */
export type ExportContentRequest = {
  expectedActivePath: string | null
  respond: (content: string) => void
}

export const EXPORT_CONTENT_EVENT = 'marko:get-export-content'

/** Request the current editor content. Resolves with fallback after timeout if no response. */
export function requestExportContent(
  fallback: string,
  options?: { expectedActivePath?: string | null; timeoutMs?: number },
): Promise<string> {
  const { expectedActivePath = null, timeoutMs = 150 } = options ?? {}
  return new Promise((resolve) => {
    let resolved = false
    const respond = (content: string) => {
      if (!resolved) {
        resolved = true
        resolve(content)
      }
    }

    window.dispatchEvent(
      new CustomEvent<ExportContentRequest>(EXPORT_CONTENT_EVENT, {
        detail: { expectedActivePath, respond },
      }),
    )

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve(fallback)
      }
    }, timeoutMs)
  })
}
