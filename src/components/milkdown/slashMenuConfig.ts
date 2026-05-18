import { commandsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'

const imageIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M19 5v14H5V5h14Zm0-2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-4.86 8.86-3 3.87L9 13.14 6 17h12l-3.86-5.14Z" />
  </svg>
`

export type SlashCommandLabels = {
  textGroup: string
  listGroup: string
  advancedGroup: string
  text: string
  heading1: string
  heading2: string
  heading3: string
  heading4: string
  heading5: string
  heading6: string
  quote: string
  divider: string
  bulletList: string
  orderedList: string
  taskList: string
  image: string
  codeBlock: string
  table: string
}

export const createSlashMenuConfig = (
  labels: SlashCommandLabels,
  onImageImport: () => Promise<boolean>,
) => ({
  textGroup: {
    label: labels.textGroup,
    text: { label: labels.text },
    h1: { label: labels.heading1 },
    h2: { label: labels.heading2 },
    h3: { label: labels.heading3 },
    h4: { label: labels.heading4 },
    h5: { label: labels.heading5 },
    h6: { label: labels.heading6 },
    quote: { label: labels.quote },
    divider: { label: labels.divider },
  },
  listGroup: {
    label: labels.listGroup,
    bulletList: { label: labels.bulletList },
    orderedList: { label: labels.orderedList },
    taskList: { label: labels.taskList },
  },
  advancedGroup: {
    label: labels.advancedGroup,
    image: null,
    codeBlock: { label: labels.codeBlock },
    table: { label: labels.table },
    math: null,
  },
  buildMenu: (builder: {
    getGroup: (key: string) => {
      addItem: (
        key: string,
        item: {
          label: string
          icon: string
          onRun: (ctx: Ctx) => void
        },
      ) => unknown
    }
  }) => {
    builder.getGroup('advanced').addItem('image-import', {
      label: labels.image,
      icon: imageIcon,
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
        void onImageImport()
      },
    })
  },
})
