function encodeSegment(value: string) {
  return encodeURIComponent(value)
}

function decodeSegment(value: string) {
  return decodeURIComponent(value)
}

export function pathToRoute(path: string) {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  const encoded = trimmed
    .split('/')
    .filter(Boolean)
    .map(encodeSegment)
    .join('/')
  return encoded ? `/${encoded}` : '/'
}

export function routeToPath(route: string | null | undefined) {
  const normalized = (route ?? '').replace(/^\/+|\/+$/g, '')
  if (!normalized) return null
  try {
    return normalized
      .split('/')
      .filter(Boolean)
      .map(decodeSegment)
      .join('/')
  } catch {
    return null
  }
}
