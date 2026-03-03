const encodeSegment = (value: string) => {
  return encodeURIComponent(value)
}

const decodeSegment = (value: string) => {
  return decodeURIComponent(value)
}

export const pathToRoute = (path: string) => {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  const encoded = trimmed.split('/').filter(Boolean).map(encodeSegment).join('/')
  return encoded ? `/${encoded}` : '/'
}

export const routeToPath = (route: string | null | undefined) => {
  const normalized = (route ?? '').replace(/^\/+|\/+$/g, '')
  if (!normalized) return null
  try {
    return normalized.split('/').filter(Boolean).map(decodeSegment).join('/')
  } catch {
    return null
  }
}
