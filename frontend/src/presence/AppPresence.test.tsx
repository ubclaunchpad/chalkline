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
  // The whole board renders, so other areas' imports need stand-ins too.
  const unused = () => {
    throw new Error('not used by this test')
  }
  return {
    CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY', NEVER: 'NEVER' },
    convertToExcalidrawElements: unused,
    exportToBlob: unused,
    exportToSvg: unused,
    getCommonBounds: unused,
    loadFromBlob: unused,
    newElementWith: unused,
    serializeAsJSON: unused,
    viewportCoordsToSceneCoords: unused,
    Excalidraw: ({ excalidrawAPI, renderTopRightUI }: ExcalidrawProps) => {
      useEffect(() => {
        const known = {
          getSceneElementsIncludingDeleted: () => [],
          getSceneElements: () => [],
          // The whole board renders, so other areas' overlays read these too.
          getAppState: () => ({
            selectedElementIds: {},
            activeTool: { type: 'selection' },
            zoom: { value: 1 },
            scrollX: 0,
            scrollY: 0,
            offsetLeft: 0,
            offsetTop: 0,
            width: 800,
            height: 600,
          }),
          updateScene,
          getFiles: () => ({}),
        }
        // Any other method (subscriptions, addFiles...) is a no-op that
        // returns an unsubscribe, so new overlays don't break this test.
        const api = new Proxy(known, {
          get: (target, name) =>
            name in target
              ? target[name as keyof typeof target]
              : () => () => undefined,
        })
        excalidrawAPI?.(api as unknown as ExcalidrawImperativeAPI)
      }, [excalidrawAPI])
      return <>{renderTopRightUI?.(false, {} as never)}</>
    },
  }
})

beforeEach(() => {
  // jsdom has no font loading; the board waits for fonts before measuring.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  })
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

    expect(screen.getByLabelText('First visitor (you)')).toBeTruthy()
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
    expect(screen.getByLabelText('Local person (you)')).toBeTruthy()

    act(() => {
      FakeWebSocket.instances[0].serverSends({
        type: 'cursor',
        from: 'remote',
        x: 31,
        y: 47,
        name: 'Remote person',
        color: '#a5c4f7',
      })
    })

    expect(screen.getByLabelText('Remote person')).toBeTruthy()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(updateScene).toHaveBeenCalled()

    const collaborators = updateScene.mock.lastCall?.[0].collaborators
    if (!collaborators) throw new Error('presence did not update collaborators')
    expect(collaborators.get('remote')).toMatchObject({
      username: 'Remote person',
      color: { background: '#a5c4f7', stroke: '#a5c4f7' },
      pointer: { x: 31, y: 47, tool: 'pointer' },
    })
  })
})
