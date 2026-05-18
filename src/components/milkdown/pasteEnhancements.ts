import { commandsCtx } from '@milkdown/kit/core'
import { linkSchema, toggleLinkCommand } from '@milkdown/kit/preset/commonmark'
import { Plugin } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

const URL_WITH_PROTOCOL_PATTERN = /^https?:\/\/\S+$/i
const WWW_URL_PATTERN = /^www\.\S+\.\S+$/i

export const normalizePastedUrl = (value: string) => {
  const text = value.trim()
  if (text.length === 0 || /\s/.test(text)) return null
  if (URL_WITH_PROTOCOL_PATTERN.test(text)) return text
  if (WWW_URL_PATTERN.test(text)) return `https://${text}`
  return null
}

export const pasteLinkOnSelection = $prose((ctx) => {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const { state } = view
        if (state.selection.empty) return false

        const href = normalizePastedUrl(event.clipboardData?.getData('text/plain') ?? '')
        if (!href) return false

        const linkMark = linkSchema.type(ctx)
        const { from, to } = state.selection
        if (state.doc.rangeHasMark(from, to, linkMark)) return false

        const commands = ctx.get(commandsCtx)
        return commands.call(toggleLinkCommand.key, { href })
      },
    },
  })
})
