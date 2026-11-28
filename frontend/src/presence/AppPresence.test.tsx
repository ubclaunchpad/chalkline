// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Collaborator,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import type { ExcalidrawProps } from '@excalidraw/excalidraw/types'
import App from '../App'
import { FakeWebSocket } from '../realtime/fakeWebSocket'

const { updateScene } = vi.hoisted(() => ({
  updateScene:
    vi.fn<(scene: { collaborators: Map<string, Collaborator> }) => void>(),
}))

vi.mock('@excalidraw/excalidraw', async () => {
  const { useEffect } = await import('react')
  return {
    Excalidraw: ({ excalidrawAPI, renderTopRightUI }: ExcalidrawProps) => {
      useEffect(() => {
        excalidrawAPI?.({
          addFiles: () => undefined,
          getAppState: () => ({ activeTool: { type: 'selection' } }),
          getSceneElementsIncludingDeleted: () => [],
          onChange: () => () => undefined,
          onPointerUp: () => () => undefined,
          setActiveTool: () => undefined,
          updateScene,
        } as unknown as ExcalidrawImperativeAPI)
      }, [excalidrawAPI])
      return (
        <div className="excalidraw-container" tabIndex={0}>
          {renderTopRightUI?.(false, {} as never)}
        </div>
      )
    },
  }
})

beforeEach(() => {
  FakeWebSocket.instances = []
  updateScene.mockClear()
  localStorage.setItem('chalkline.displayName', 'Local person')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false
    },
  })
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined
      disconnect = () => undefined
    },
  )
  window.history.replaceState(null, '', '/?board=presence-integration')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  localStorage.clear()
})

describe('App presence integration', () => {
  it('saves a first-time visitor identity and shows it in the participant list', () => {
    localStorage.removeItem('chalkline.displayName')
    render(<App />)
    expect(FakeWebSocket.instances).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'First visitor' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Join board' }))

    expect(screen.getByLabelText('First visitor (you)')).toBeTruthy()
    expect(localStorage.getItem('chalkline.displayName')).toBe('First visitor')
  })

  it.each([
    [
      'joining',
      () => {
        fireEvent.click(screen.getByRole('button', { name: 'Join board' }))
      },
    ],
    [
      'continuing as a guest',
      () => {
        const dialog = document.querySelector('dialog')
        if (!dialog) throw new Error('name dialog is not open')
        fireEvent(dialog, new Event('cancel', { cancelable: true }))
      },
    ],
  ])('focuses the board after %s', (_name, closeDialog) => {
    localStorage.removeItem('chalkline.displayName')
    render(<App />)
    expect(document.activeElement?.id).toBe('presence-name')

    closeDialog()

    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(
      document.querySelector('.excalidraw-container'),
    )
  })

  it('focuses the board on load for a returning visitor', () => {
    render(<App />)

    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(
      document.querySelector('.excalidraw-container'),
    )
  })

  it('does not take focus a returning visitor already moved', () => {
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    elsewhere.focus()

    render(<App />)

    expect(document.activeElement).toBe(elsewhere)
    elsewhere.remove()
  })

  it('uses the shared board connection to render remote cursors and names', () => {
    render(<App />)
    expect(FakeWebSocket.instances).toHaveLength(1)

    act(() => {
      FakeWebSocket.instances[0].serverOpens()
      FakeWebSocket.instances[0].serverSends({
        type: 'welcome',
        clientId: 'self',
      })
    })
    expect(screen.getByLabelText('Local person (you)')).toBeTruthy()

    act(() => {
      FakeWebSocket.instances[0].serverSends({
        type: 'cursor',
        from: 'remote',
        x: 31,
        y: 47,
        name: 'Remote person',
        color: '#74c0fc',
      })
    })

    expect(screen.getByLabelText('Remote person')).toBeTruthy()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(updateScene).toHaveBeenCalled()

    const collaborators = updateScene.mock.lastCall?.[0].collaborators
    if (!collaborators) throw new Error('presence did not update collaborators')
    expect(collaborators.get('remote')).toMatchObject({
      username: 'Remote person',
      color: { background: '#74c0fc', stroke: '#74c0fc' },
      pointer: { x: 31, y: 47, tool: 'pointer' },
    })
  })
})
