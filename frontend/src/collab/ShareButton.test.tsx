// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardProvider } from '../app/board'
import { useBoard } from '../app/context'
import type { BoardConnection } from '../realtime/connection'
import type { ServerMessage } from '../realtime/messages'
import { boardKey, socketParams } from '../realtime/shareKeys'
import { BoardConnectionContext } from '../realtime/useBoardConnection'
import { ShareButton } from './ShareButton'

// The real package needs a browser canvas to load; nothing here draws.
vi.mock('@excalidraw/excalidraw', () => ({ CaptureUpdateAction: {} }))

function fakeConnection() {
  const welcomes = new Set<(message: ServerMessage) => void>()
  const connection = {
    on: (type: string, handler: (message: ServerMessage) => void) => {
      if (type === 'welcome') welcomes.add(handler)
      return () => welcomes.delete(handler)
    },
  } as unknown as BoardConnection
  const welcome = (
    message: Omit<ServerMessage & { type: 'welcome' }, 'type'>,
  ) => {
    act(() => {
      welcomes.forEach((handler) => {
        handler({ type: 'welcome', ...message })
      })
    })
  }
  return { connection, welcome }
}

function AccessProbe() {
  return <p data-testid="access">{useBoard().access}</p>
}

function renderShare() {
  const fake = fakeConnection()
  render(
    <BoardConnectionContext value={fake.connection}>
      <BoardProvider api={null} boardId="b1">
        <ShareButton />
        <AccessProbe />
      </BoardProvider>
    </BoardConnectionContext>,
  )
  return fake
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?board=b1')
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('ShareButton', () => {
  it('gives an editor both links and remembers the edit key', () => {
    const { welcome } = renderShare()
    welcome({
      clientId: 'c1',
      access: 'edit',
      keys: { edit: 'E1', view: 'V1' },
    })
    expect(screen.getByTestId('access').textContent).toBe('edit')
    expect(boardKey('b1', '')).toBe('E1')

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const edit = screen.getByLabelText<HTMLInputElement>(
      'Anyone with this link can edit',
    )
    const view = screen.getByLabelText<HTMLInputElement>(
      'Anyone with this link can view',
    )
    expect(edit.value).toBe('http://localhost:3000/?board=b1&key=E1')
    expect(view.value).toBe('http://localhost:3000/?board=b1&key=V1')
    expect(screen.getByText('You can edit this board.')).toBeTruthy()
  })

  it('switches a view link to view-only and shows only its own link', () => {
    window.history.replaceState(null, '', '/?board=b1&key=V1')
    const { welcome } = renderShare()
    welcome({ clientId: 'c1', access: 'view' })
    expect(screen.getByTestId('access').textContent).toBe('view')
    // A view key is never stored, so it cannot replace an edit key.
    expect(boardKey('b1', '')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.queryByLabelText('Anyone with this link can edit')).toBeNull()
    expect(
      screen.getByLabelText<HTMLInputElement>('Anyone with this link can view')
        .value,
    ).toContain('key=V1')
  })

  it('treats a server without share keys as editable by everyone', () => {
    const { welcome } = renderShare()
    welcome({ clientId: 'c1' })
    expect(screen.getByTestId('access').textContent).toBe('edit')
  })
})

describe('boardKey', () => {
  it('prefers the key in the address over a remembered one', () => {
    localStorage.setItem('chalkline.editKey.b1', 'stored')
    expect(boardKey('b1', '?board=b1&key=fromUrl')).toBe('fromUrl')
    expect(boardKey('b1', '?board=b1')).toBe('stored')
    expect(boardKey('other', '?board=other')).toBeNull()
  })

  it('proposes and saves an edit key before the first connection', () => {
    const first = socketParams('new', '?board=new')
    expect(first.claim).toMatch(/^[0-9a-f]{32}$/)
    // The next attempt sends the same value as its key.
    expect(socketParams('new', '?board=new')).toEqual({ key: first.claim })
  })
})
