export function normalizePath(value: string) {
  const parts = value.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

export function resolveRelativePath(base: string, target: string) {
  const [pathPart] = target.split('#')
  if (pathPart.startsWith('/')) {
    return normalizePath(pathPart.slice(1))
  }
  const baseDir = base.split('/').slice(0, -1).join('/')
  const joined = baseDir ? `${baseDir}/${pathPart}` : pathPart
  return normalizePath(joined)
}

export function createFileLabel(relativePath: string) {
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(/\.(md|markdown)$/i, '')
}

export function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export function isExternalLink(target: string) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(target)
}

export function extractLinks(content: string) {
  const links: Array<{ text: string; target: string; type: 'markdown' | 'wiki' }> = []
  const mdRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const wikiRegex = /\[\[([^\]]+)\]\]/g

  let match = mdRegex.exec(content)
  while (match) {
    links.push({ text: match[1].trim(), target: match[2].trim(), type: 'markdown' })
    match = mdRegex.exec(content)
  }

  match = wikiRegex.exec(content)
  while (match) {
    links.push({ text: match[1].trim(), target: match[1].trim(), type: 'wiki' })
    match = wikiRegex.exec(content)
  }

  return links
}
