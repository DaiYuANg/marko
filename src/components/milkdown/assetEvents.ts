import type { ClipboardEvent, DragEvent } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { readImage, readText } from '@tauri-apps/plugin-clipboard-manager'
import { open } from '@tauri-apps/plugin-dialog'
import { MARKO_FILE_TREE_ITEM_MIME, readFileTreeDragPayload } from '@/logic/fileDragPayload'
import { extractHeadings } from '@/logic/paths'
import { fsApi } from '@/services/fsApi'
import type { MarkdownAssetImportStrategy } from '@/store/useAppStore'

type FileWithPath = File & {
  path?: unknown
}

type ImportMarkdownAssetOptions = {
  activePath: string | null
  markdown: string
  strategy: MarkdownAssetImportStrategy
  insertImage: (src: string, alt?: string) => boolean
}

export type MarkdownImageImportSource =
  | {
      kind: 'file'
      file: File
    }
  | {
      kind: 'path'
      path: string
      name?: string
    }
  | {
      kind: 'url'
      url: string
      name?: string
    }

export const hasImageFiles = (files: FileList | null | undefined) => {
  return Array.from(files ?? []).some(isImageFile)
}

export const hasImageDataTransfer = (dataTransfer: DataTransfer) => {
  if (hasImageFiles(dataTransfer.files)) return true
  const fileTreePayload = readFileTreeDragPayload(dataTransfer)
  if (fileTreePayload && isImagePath(fileTreePayload.name)) return true
  if (Array.from(dataTransfer.types).includes(MARKO_FILE_TREE_ITEM_MIME)) return true

  return Array.from(dataTransfer.items).some((item) => {
    if (item.kind !== 'file') return false
    if (item.type.startsWith('image/')) return true
    const file = item.getAsFile()
    return file ? isImageFile(file) : true
  })
}

export const importMarkdownImageFiles = async (
  files: File[],
  options: ImportMarkdownAssetOptions,
) => {
  return importMarkdownImageSources(
    files.map((file) => ({ kind: 'file', file })),
    options,
  )
}

export const importMarkdownImageSources = async (
  sources: MarkdownImageImportSource[],
  { activePath, insertImage, markdown, strategy }: ImportMarkdownAssetOptions,
) => {
  if (!activePath) return false

  const title = extractHeadings(markdown)[0]?.text ?? null
  let imported = false

  for (const source of sources.filter(isImageImportSource)) {
    if (source.kind === 'url') {
      const alt = cleanAltText(source.name || source.url)
      imported = insertImage(source.url, alt) || imported
      continue
    }

    const result = await importMarkdownAsset(source, activePath, strategy, title)
    const alt = cleanAltText(source.kind === 'file' ? source.file.name : source.name || source.path)
    imported = insertImage(result.markdown_target, alt) || imported
  }

  return imported
}

export const filesFromPasteEvent = (event: ClipboardEvent<HTMLElement>) => {
  return Array.from(event.clipboardData.files).filter(isImageFile)
}

export const imageSourcesFromPasteEvent = (event: ClipboardEvent<HTMLElement>) => {
  const fileSources = filesFromPasteEvent(event).map((file) => ({
    kind: 'file' as const,
    file,
  }))
  return [
    ...fileSources,
    ...imageSourcesFromClipboardText(event.clipboardData.getData('text/plain')),
  ]
}

export const filesFromDropEvent = (event: DragEvent<HTMLElement>) => {
  return Array.from(event.dataTransfer.files).filter(isImageFile)
}

export const imageSourcesFromDropEvent = (event: DragEvent<HTMLElement>) => {
  const fileSources = filesFromDropEvent(event).map((file) => ({
    kind: 'file' as const,
    file,
  }))
  return [...fileSources, ...pathSourcesFromDataTransfer(event.dataTransfer)]
}

export const imageSourcesFromTauriDropPaths = (paths: string[]) => {
  return paths.filter(isImagePath).map((path) => ({
    kind: 'path' as const,
    name: fileNameFromPath(path),
    path,
  }))
}

export const pickMarkdownImageSource = async (): Promise<MarkdownImageImportSource | null> => {
  if (isTauri()) {
    const selectedPath = await open({
      multiple: false,
      filters: [
        {
          name: 'Images',
          extensions: ['apng', 'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
        },
      ],
    })
    if (typeof selectedPath === 'string') {
      return {
        kind: 'path',
        name: fileNameFromPath(selectedPath),
        path: selectedPath,
      }
    }
  }

  return pickMarkdownImageFile()
}

export const readNativeClipboardImageSource =
  async (): Promise<MarkdownImageImportSource | null> => {
    if (!isTauri()) return null

    const imageSource = await readNativeClipboardImage().catch(() => null)
    if (imageSource) return imageSource

    const text = await readText().catch(() => '')
    return imageSourcesFromClipboardText(text)[0] ?? null
  }

const importMarkdownAsset = async (
  source: MarkdownImageImportSource,
  activePath: string,
  strategy: MarkdownAssetImportStrategy,
  title: string | null,
) => {
  if (source.kind === 'path') {
    return fsApi.importMarkdownAsset({
      sourcePath: await resolveSourcePath(source.path),
      documentPath: activePath,
      strategy,
      title,
    })
  }

  if (source.kind === 'url') {
    throw new Error('URL image sources are inserted directly and should not be imported')
  }

  const sourcePath = getFileSourcePath(source.file)
  if (sourcePath) {
    return fsApi.importMarkdownAsset({
      sourcePath,
      documentPath: activePath,
      strategy,
      title,
    })
  }

  return fsApi.importMarkdownAssetBase64({
    fileName: source.file.name || `image-${Date.now()}.${extensionFromMimeType(source.file.type)}`,
    base64Data: await blobToBase64(source.file),
    documentPath: activePath,
    title,
  })
}

const blobToBase64 = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image asset'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

const getFileSourcePath = (file: File) => {
  const value = (file as FileWithPath).path
  return typeof value === 'string' && value.length > 0 ? value : null
}

const isImageFile = (file: File) => {
  if (file.type.startsWith('image/')) return true
  return isImagePath(file.name)
}

const isImageImportSource = (source: MarkdownImageImportSource) => {
  if (source.kind === 'file') return isImageFile(source.file)
  if (source.kind === 'url') return isImagePath(source.url)
  return isImagePath(source.name || source.path)
}

const isImagePath = (path: string) => {
  return /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path.split(/[?#]/)[0] ?? path)
}

const cleanAltText = (fileName: string) => {
  return fileNameFromPath(fileName)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

const extensionFromMimeType = (mimeType: string) => {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/svg+xml') return 'svg'
  const subtype = mimeType.split('/')[1]
  return subtype && /^[a-z0-9.+-]+$/i.test(subtype) ? subtype.replace('+xml', '') : 'png'
}

const pathSourcesFromDataTransfer = (dataTransfer: DataTransfer) => {
  const fileTreePayload = readFileTreeDragPayload(dataTransfer)
  const paths = [
    ...(fileTreePayload ? [{ path: fileTreePayload.path, name: fileTreePayload.name }] : []),
    ...fileUriListToPaths(dataTransfer.getData('text/uri-list')).map((path) => ({
      path,
      name: fileNameFromPath(path),
    })),
  ]

  const seen = new Set<string>()
  return paths
    .filter(({ name, path }) => isImagePath(name || path))
    .filter(({ path }) => {
      if (seen.has(path)) return false
      seen.add(path)
      return true
    })
    .map(({ name, path }) => ({
      kind: 'path' as const,
      name,
      path,
    }))
}

const imageSourcesFromClipboardText = (value: string) => {
  const text = value.trim()
  if (!text) return []

  const filePaths = fileUriListToPaths(text)
  if (filePaths.length > 0) {
    return filePaths.filter(isImagePath).map((path) => ({
      kind: 'path' as const,
      name: fileNameFromPath(path),
      path,
    }))
  }

  if (/^https?:\/\//i.test(text) && isImagePath(text)) {
    return [
      {
        kind: 'url' as const,
        name: fileNameFromPath(text),
        url: text,
      },
    ]
  }

  if (isImagePath(text)) {
    return [
      {
        kind: 'path' as const,
        name: fileNameFromPath(text),
        path: text,
      },
    ]
  }

  return []
}

const fileUriListToPaths = (value: string) => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => line.startsWith('file://'))
    .map((line) => {
      try {
        return decodeURIComponent(new URL(line).pathname)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

const pickMarkdownImageFile = () => {
  return new Promise<MarkdownImageImportSource | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0] ?? null
        input.remove()
        resolve(file ? { kind: 'file', file } : null)
      },
      { once: true },
    )
    document.body.append(input)
    input.click()
  })
}

const readNativeClipboardImage = async (): Promise<MarkdownImageImportSource | null> => {
  const image = await readImage()
  try {
    const [{ height, width }, rgba] = await Promise.all([image.size(), image.rgba()])
    const png = await rgbaToPng(rgba, width, height)
    return {
      kind: 'file',
      file: new File([png], `clipboard-${Date.now()}.png`, { type: 'image/png' }),
    }
  } finally {
    await image.close().catch(() => {})
  }
}

const rgbaToPng = async (rgba: Uint8Array, width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is not available')
  }

  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('Failed to encode clipboard image'))
    }, 'image/png')
  })
}

const resolveSourcePath = async (path: string) => {
  if (isAbsolutePath(path)) return path
  const metadata = await fsApi.getPathMetadata(path)
  return metadata.absolute_path
}

const isAbsolutePath = (path: string) => {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

const fileNameFromPath = (path: string) => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
