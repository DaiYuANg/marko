import { commandsCtx } from '@milkdown/kit/core'
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { keymap } from '@milkdown/kit/prose/keymap'
import type { Command } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

const run = (command: () => void): Command => {
  return () => {
    command()
    return true
  }
}

export const markdownEditorShortcuts = $prose((ctx) => {
  const commands = ctx.get(commandsCtx)

  const setParagraph = () => {
    commands.call(setBlockTypeCommand.key, {
      nodeType: paragraphSchema.type(ctx),
    })
  }

  const setHeading = (level: number) => {
    commands.call(setBlockTypeCommand.key, {
      nodeType: headingSchema.type(ctx),
      attrs: { level },
    })
  }

  const setCodeBlock = () => {
    commands.call(setBlockTypeCommand.key, {
      nodeType: codeBlockSchema.type(ctx),
    })
  }

  const wrapInBulletList = () => {
    commands.call(wrapInBlockTypeCommand.key, {
      nodeType: bulletListSchema.type(ctx),
    })
  }

  const wrapInOrderedList = () => {
    commands.call(wrapInBlockTypeCommand.key, {
      nodeType: orderedListSchema.type(ctx),
    })
  }

  const wrapInBlockquote = () => {
    commands.call(wrapInBlockTypeCommand.key, {
      nodeType: blockquoteSchema.type(ctx),
    })
  }

  return keymap({
    'Mod-Alt-0': run(setParagraph),
    'Mod-Alt-1': run(() => setHeading(1)),
    'Mod-Alt-2': run(() => setHeading(2)),
    'Mod-Alt-3': run(() => setHeading(3)),
    'Mod-Alt-4': run(() => setHeading(4)),
    'Mod-Alt-5': run(() => setHeading(5)),
    'Mod-Alt-6': run(() => setHeading(6)),
    'Mod-Alt-C': run(setCodeBlock),
    'Mod-Shift-7': run(wrapInOrderedList),
    'Mod-Shift-8': run(wrapInBulletList),
    'Mod-Shift-9': run(wrapInBlockquote),
  })
})
