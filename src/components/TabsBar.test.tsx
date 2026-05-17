import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TabsBar from '@/components/TabsBar'
import i18n from '@/i18n/setup'
import { useAppStore } from '@/store/useAppStore'

const createProps = () => ({
  tabs: [{ kind: 'file' as const, path: 'notes/current.md' }],
  dirtyPaths: {},
  saveStates: {},
  activeTabId: 'file:notes/current.md',
  onOpenTab: vi.fn(),
  onCloseTab: vi.fn(),
  viewMode: 'source' as const,
  onChangeView: vi.fn(),
  silentSave: true,
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
        silentSave={false}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'saving' } }}
      />,
    )

    expect(screen.getByText('Saving')).toBeInTheDocument()
  })

  it('hides routine save state when silent save is enabled', () => {
    render(
      <TabsBar
        {...createProps()}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'saving' } }}
      />,
    )

    expect(screen.queryByText('Saving')).not.toBeInTheDocument()
  })

  it('still shows save errors when silent save is enabled', () => {
    render(
      <TabsBar
        {...createProps()}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'error' } }}
      />,
    )

    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })
})
