import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TabsBar from '@/components/TabsBar'
import i18n from '@/i18n/setup'
import { useAppStore } from '@/store/useAppStore'

const createProps = () => ({
  tabs: ['notes/current.md'],
  dirtyPaths: {},
  saveStates: {},
  activePath: 'notes/current.md',
  onOpenFile: vi.fn(),
  onCloseTab: vi.fn(),
  viewMode: 'source' as const,
  onChangeView: vi.fn(),
})

beforeEach(async () => {
  localStorage.clear()
  useAppStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

describe('TabsBar', () => {
  it('shows the active file save state', () => {
    render(
      <TabsBar
        {...createProps()}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'saving' } }}
      />,
    )

    expect(screen.getByText('Saving')).toBeInTheDocument()
  })
})
