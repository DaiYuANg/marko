import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { Slice, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'
import clamp from 'lodash-es/clamp'
import { slugify } from '@/logic/paths'

export type PendingExternalValue = {
  path: string | null
  value: string
  baseValue: string
}

export const readCrepeMarkdown = (crepe: Crepe | null, fallback: string) => {
  if (!crepe) return fallback
  try {
    return crepe.getMarkdown() ?? fallback
  } catch {
    return fallback
  }
}

export const focusCrepeEditor = (crepe: Crepe | null) => {
  if (!crepe) return
  crepe.editor.action((ctx) => {
    ctx.get(editorViewCtx).focus()
  })
}

export const replaceCrepeMarkdown = (
  crepe: Crepe,
  nextValue: string,
  applyingExternalValueRef: { current: boolean },
  latestValueRef: { current: string },
) => {
  crepe.editor.action((ctx) => {
    applyingExternalValueRef.current = true
    try {
      const view = ctx.get(editorViewCtx)
      const parser = ctx.get(parserCtx)
      const doc = parser(nextValue)
      if (!doc) return
      const state = view.state
      const selection = state.selection
      let tr = state.tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))
      const safeFrom = clamp(selection.from, 0, Math.max(0, doc.content.size - 2))
      tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)))
      view.dispatch(tr)
      latestValueRef.current = nextValue
    } finally {
      applyingExternalValueRef.current = false
    }
  })
}

const findHeadingPosition = (doc: ProseMirrorNode, targetSlug: string) => {
  const usedSlugs = new Map<string, number>()
  let headingIndex = 0
  let foundPosition: number | null = null

  doc.descendants((node, pos) => {
    if (foundPosition !== null) return false
    if (node.type.name !== 'heading') return true

    const text = node.textContent.trim()
    const baseSlug = slugify(text) || `heading-${headingIndex + 1}`
    const usedCount = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, usedCount + 1)
    const slug = usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount}`
    headingIndex += 1

    if (slug === targetSlug) {
      foundPosition = pos
      return false
    }

    return true
  })

  return foundPosition
}

export const focusHeadingInCrepe = (crepe: Crepe, slug: string) => {
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const position = findHeadingPosition(view.state.doc, slug)
    if (position === null) return

    const selectionPosition = Math.min(position + 1, view.state.doc.content.size)
    const tr = view.state.tr
      .setSelection(Selection.near(view.state.doc.resolve(selectionPosition)))
      .scrollIntoView()
    view.dispatch(tr)
    view.focus()
  })
}
