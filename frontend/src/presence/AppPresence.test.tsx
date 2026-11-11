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
          getSceneElementsIncludingDeleted: () => [],
          updateScene,
        } as unknown as ExcalidrawImperativeAPI)
      }, [excalidrawAPI])
      return <>{renderTopRightUI?.(false, {} as never)}</>
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

    expect(screen.getByText('First visitor (you)')).toBeTruthy()
    expect(localStorage.getItem('chalkline.displayName')).toBe('First visitor')
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
    expect(screen.getByText('Local person (you)')).toBeTruthy()

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

    expect(screen.getByText('Remote person')).toBeTruthy()
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
