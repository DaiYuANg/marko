import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { fsApi } from '@/services/fsApi'

const localProtocolPattern = /^(https?:|data:|blob:|asset:|file:)/i

export const isExternalMarkdownImageSource = (src: string) => {
  return localProtocolPattern.test(src.trim())
}

export const resolveMarkdownImageSource = async (documentPath: string | null, src: string) => {
  const target = src.trim()
  if (!target || isExternalMarkdownImageSource(target) || !documentPath || !isTauri()) {
    return src
  }

  try {
    const resolved = await fsApi.resolveMarkdownAsset({
      documentPath,
      target,
    })
    if (resolved.is_external || !resolved.exists || !resolved.absolute_path) {
      return src
    }
    return convertFileSrc(resolved.absolute_path)
  } catch (error) {
    console.warn('Failed to resolve Markdown image source', error)
    return src
  }
}
