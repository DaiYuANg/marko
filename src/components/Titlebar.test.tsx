import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import Titlebar from '@/components/Titlebar'
import i18n from '@/i18n/setup'
import { useAppStore } from '@/store/useAppStore'

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
    isMaximized: vi.fn(),
    maximize: vi.fn(),
    minimize: vi.fn(),
    startDragging: vi.fn(),
    unmaximize: vi.fn(),
  }),
}))

vi.mock('@/utils/tauri', () => ({
  inferPlatformFromUserAgent: () => 'windows',
  isTauriRuntime: () => false,
}))

type TitlebarProps = ComponentProps<typeof Titlebar>

const workspaceIndex = {
  files: [
    {
      path: 'notes/target.md',
      headings: [
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Indexed Detail',
          slug: 'indexed-detail',
          line: 4,
        },
      ],
      links: [],
    },
  ],
} satisfies NonNullable<TitlebarProps['workspaceIndex']>

const createProps = (overrides: Partial<TitlebarProps> = {}): TitlebarProps => ({
  onToggleSidebar: vi.fn(),
  onToggleRightSidebar: vi.fn(),
  onSelectProject: vi.fn(),
  onSelectSingleFile: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onChangeView: vi.fn(),
  files: [{ path: 'notes/target.md', kind: 'file' }],
  workspaceIndex,
  isMaximized: false,
  setIsMaximized: vi.fn(),
  theme: 'marko-light',
  setTheme: vi.fn(),
  ...overrides,
})

beforeEach(async () => {
  localStorage.clear()
  useAppStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

describe('Titlebar command palette', () => {
  it('opens workspace files from the command palette', async () => {
    const onOpenFile = vi.fn()
    render(<Titlebar {...createProps({ onOpenFile })} />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    await userEvent.click(await screen.findByText('target'))

    expect(onOpenFile).toHaveBeenCalledWith('notes/target.md')
  })

  it('opens indexed headings from the command palette', async () => {
    const onOpenHeading = vi.fn()
    render(<Titlebar {...createProps({ onOpenHeading })} />)

    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    await userEvent.click(await screen.findByText('## Indexed Detail'))

    expect(onOpenHeading).toHaveBeenCalledWith('notes/target.md', 'indexed-detail')
  })
})
