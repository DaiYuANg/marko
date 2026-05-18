import type { Crepe } from '@milkdown/crepe'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  insertImageCommand,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import type { ShortcutActionId } from '@/logic/shortcuts'

const headingShortcutLevels: Partial<Record<ShortcutActionId, number>> = {
  'editor.heading1': 1,
  'editor.heading2': 2,
  'editor.heading3': 3,
  'editor.heading4': 4,
  'editor.heading5': 5,
  'editor.heading6': 6,
}

export const runMarkdownEditorShortcut = (crepe: Crepe | null, action: ShortcutActionId) => {
  if (!crepe) return false
  let handled = false

  crepe.editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)

    const setParagraph = () =>
      commands.call(setBlockTypeCommand.key, {
        nodeType: paragraphSchema.type(ctx),
      })

    const setHeading = (level: number) =>
      commands.call(setBlockTypeCommand.key, {
        nodeType: headingSchema.type(ctx),
        attrs: { level },
      })

    const setCodeBlock = () =>
      commands.call(setBlockTypeCommand.key, {
        nodeType: codeBlockSchema.type(ctx),
      })

    const wrapInBulletList = () =>
      commands.call(wrapInBlockTypeCommand.key, {
        nodeType: bulletListSchema.type(ctx),
      })

    const wrapInOrderedList = () =>
      commands.call(wrapInBlockTypeCommand.key, {
        nodeType: orderedListSchema.type(ctx),
      })

    const wrapInBlockquote = () =>
      commands.call(wrapInBlockTypeCommand.key, {
        nodeType: blockquoteSchema.type(ctx),
      })

    const clearFormat = () => {
      const view = ctx.get(editorViewCtx)
      const { from, to } = view.state.selection
      let tr = view.state.tr
      Object.values(view.state.schema.marks).forEach((mark) => {
        tr = tr.removeMark(from, to, mark)
      })
      view.dispatch(tr)
      return setParagraph()
    }

    const headingLevel = headingShortcutLevels[action]
    if (headingLevel) {
      handled = setHeading(headingLevel)
      return
    }

    switch (action) {
      case 'editor.paragraph':
        handled = setParagraph()
        break
      case 'editor.bold':
        handled = commands.call(toggleStrongCommand.key)
        break
      case 'editor.italic':
        handled = commands.call(toggleEmphasisCommand.key)
        break
      case 'editor.inlineCode':
        handled = commands.call(toggleInlineCodeCommand.key)
        break
      case 'editor.strike':
        handled = commands.call(toggleStrikethroughCommand.key)
        break
      case 'editor.link': {
        const href = window.prompt('Link URL')
        handled = href ? commands.call(toggleLinkCommand.key, { href }) : true
        break
      }
      case 'editor.image': {
        const src = window.prompt('Image URL')
        handled = src
          ? commands.call(insertImageCommand.key, {
              src,
              alt: '',
              title: '',
            })
          : true
        break
      }
      case 'editor.codeBlock':
        handled = setCodeBlock()
        break
      case 'editor.quote':
        handled = wrapInBlockquote()
        break
      case 'editor.orderedList':
        handled = wrapInOrderedList()
        break
      case 'editor.bulletList':
        handled = wrapInBulletList()
        break
      case 'editor.table':
        handled = commands.call(insertTableCommand.key, { row: 3, col: 3 })
        break
      case 'editor.clearFormat':
        handled = clearFormat()
        break
    }
  })

  return handled
}

export const editorShortcutActionIds = [
  'editor.paragraph',
  'editor.heading1',
  'editor.heading2',
  'editor.heading3',
  'editor.heading4',
  'editor.heading5',
  'editor.heading6',
  'editor.bold',
  'editor.italic',
  'editor.inlineCode',
  'editor.strike',
  'editor.link',
  'editor.image',
  'editor.codeBlock',
  'editor.quote',
  'editor.orderedList',
  'editor.bulletList',
  'editor.table',
  'editor.clearFormat',
] as const satisfies readonly ShortcutActionId[]
