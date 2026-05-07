import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'

const fsApiMock = vi.hoisted(() => ({
  flushBuffers: vi.fn(),
  getBufferStatus: vi.fn(),
  openFile: vi.fn(),
  updateBuffer: vi.fn(),
}))

const eventHandlers = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void | Promise<void>>(),
)

vi.mock('@/utils/tauri', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('@/services/fsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/fsApi')>()
  return {
    ...actual,
    fsApi: fsApiMock,
  }
})

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    eventHandlers.set(event, handler)
    return vi.fn()
  }),
}))

const Harness = () => {
  const buffer = useEditorBuffer({
    activePath: 'notes/current.md',
    workspaceKey: 'internal:/workspace',
  })
  const state = buffer.saveStates['notes/current.md']?.status ?? 'none'
  const dirty = Boolean(buffer.dirtyPaths['notes/current.md'])

  return (
    <button type="button" onClick={() => buffer.onEditorChange('changed')}>
      {state}:{String(dirty)}
    </button>
  )
}

beforeEach(() => {
  eventHandlers.clear()
  fsApiMock.flushBuffers.mockResolvedValue(0)
  fsApiMock.getBufferStatus.mockResolvedValue({
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
  })
  fsApiMock.openFile.mockResolvedValue('initial')
  fsApiMock.updateBuffer.mockResolvedValue({
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
  })
})

afterEach(() => {
  eventHandlers.clear()
})

describe('useEditorBuffer', () => {
  it('keeps a file dirty until the Rust buffer reports a clean flush', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(await screen.findByText('saved:false')).toBeInTheDocument()

    await user.click(screen.getByRole('button'))
    expect(screen.getByText('unsaved:true')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(fsApiMock.updateBuffer).toHaveBeenCalledWith('notes/current.md', 'changed')
      },
      { timeout: 2000 },
    )
    expect(screen.getByText('saving:true')).toBeInTheDocument()

    await act(async () => {
      eventHandlers.get('fs-buffer-status')?.({
        payload: {
          path: 'notes/current.md',
          revision: 1,
          dirty: false,
        },
      })
    })

    expect(screen.getByText('saved:false')).toBeInTheDocument()
  })
})
