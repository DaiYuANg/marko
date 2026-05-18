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
  codeBlock: string
  table: string
}

export const createSlashMenuConfig = (labels: SlashCommandLabels) => ({
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
})
