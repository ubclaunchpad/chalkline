// @vitest-environment jsdom
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { FakeWebSocket } from './realtime/fakeWebSocket'
import { SCENE_SEND_INTERVAL_MS } from './realtime/useSceneSync'

interface MockExcalidrawProps {
  excalidrawAPI?: (api: ExcalidrawImperativeAPI) => void
  onChange?: (elements: readonly OrderedExcalidrawElement[]) => void
  theme?: 'dark' | 'light'
}

const mockExcalidraw = vi.hoisted(() => {
  let scene: readonly OrderedExcalidrawElement[] = []
  const updateScene = vi.fn(
    ({ elements }: { elements?: readonly OrderedExcalidrawElement[] }) => {
      if (elements) scene = elements
    },
  )

  return {
    api: {
      getAppState: () => ({ activeTool: { type: 'selection' } }),
      getSceneElementsIncludingDeleted: () => scene,
      onChange: () => () => undefined,
      onPointerUp: () => () => undefined,
      setActiveTool: () => undefined,
      updateScene,
    } as unknown as ExcalidrawImperativeAPI,
    updateScene,
    apiRegistrations: 0,
    props: null as MockExcalidrawProps | null,
    reset() {
      scene = []
      this.props = null
      this.apiRegistrations = 0
      updateScene.mockClear()
    },
    setScene(elements: readonly OrderedExcalidrawElement[]) {
      scene = elements
    },
  }
})

vi.mock('@excalidraw/excalidraw', async () => {
  const { useEffect } = await import('react')

  return {
    CaptureUpdateAction: {
      NEVER: 'NEVER',
    },
    Excalidraw(props: MockExcalidrawProps) {
      mockExcalidraw.props = props
      const { excalidrawAPI } = props
      useEffect(() => {
        mockExcalidraw.apiRegistrations += 1
        excalidrawAPI?.(mockExcalidraw.api)
      }, [excalidrawAPI])
      return null
    },
  }
})

type RectangleElement = Extract<OrderedExcalidrawElement, { type: 'rectangle' }>

const rectangle = ({
  id,
  version = 1,
  x = 0,
}: {
  id: string
  version?: number
  x?: number
}): RectangleElement => ({
  id,
  type: 'rectangle',
  x,
  y: 0,
  width: 100,
  height: 100,
  angle: 0,
  strokeColor: '#1b1b1f',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 1,
  strokeStyle: 'solid',
  roundness: null,
  roughness: 1,
  opacity: 100,
  seed: 1,
  version,
  versionNonce: 1,
  index: id as RectangleElement['index'],
  isDeleted: false,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
})

function socket(): FakeWebSocket {
  const connection = FakeWebSocket.instances.at(0)
  if (!connection) throw new Error('no socket was opened')
  return connection
}

beforeEach(() => {
  FakeWebSocket.instances = []
  mockExcalidraw.reset()
  localStorage.setItem('chalkline.displayName', 'Test user')
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined
      disconnect = () => undefined
    },
  )
  window.history.replaceState(null, '', '/?board=team')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('App scene synchronization', () => {
  it('loads the board in Chalkline dark mode with truthful product chrome', () => {
    render(<App />)

    expect(mockExcalidraw.props?.theme).toBe('dark')
    expect(screen.getByAltText('Chalkline')).toBeDefined()
    expect(screen.getByText('team')).toBeDefined()
    expect(screen.getByRole('status').textContent).toBe('Connecting…')
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /theme/i })).toBeNull()
  })

  it('keeps the same editor scene when the component panel is toggled', () => {
    render(<App />)
    const local = rectangle({ id: 'kept' })
    mockExcalidraw.setScene([local])

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide components panel' }),
    )

    const sidebar = document.getElementById('component-sidebar')
    expect(sidebar?.parentElement?.hidden).toBe(true)
    expect(mockExcalidraw.api.getSceneElementsIncludingDeleted()).toEqual([
      local,
    ])
    expect(mockExcalidraw.apiRegistrations).toBe(1)

    fireEvent.click(
      screen.getByRole('button', { name: 'Show components panel' }),
    )
    expect(sidebar?.parentElement?.hidden).toBe(false)
    expect(mockExcalidraw.apiRegistrations).toBe(1)
  })

  it('returns focus to the component-panel button when the panel closes', () => {
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Close components panel' }),
    )

    const opener = screen.getByRole('button', {
      name: 'Show components panel',
    })
    expect(document.activeElement).toBe(opener)
  })

  it('dismisses the component panel with Escape and returns focus', () => {
    render(<App />)
    const sidebar = document.getElementById('component-sidebar')
    if (!sidebar) throw new Error('component sidebar was not rendered')

    screen.getByRole('button', { name: /Add Client:/ }).focus()
    fireEvent.keyDown(sidebar, { key: 'Escape' })

    const opener = screen.getByRole('button', {
      name: 'Show components panel',
    })
    expect(document.activeElement).toBe(opener)
    expect(sidebar.parentElement?.hidden).toBe(true)
  })

  it('sends local changes through the one shared board connection', () => {
    render(<App />)
    expect(FakeWebSocket.instances).toHaveLength(1)

    const local = rectangle({ id: 'local' })
    mockExcalidraw.setScene([local])

    act(() => {
      socket().serverOpens()
      mockExcalidraw.props?.onChange?.([local])
      vi.advanceTimersByTime(SCENE_SEND_INTERVAL_MS)
    })

    expect(socket().sent).toEqual([
      JSON.stringify({ type: 'change', elements: [local] }),
    ])
  })

  it('applies remote changes to the Excalidraw scene', () => {
    const local = rectangle({ id: 'shape', x: 10 })
    const remote = rectangle({ id: 'shape', version: 2, x: 20 })
    mockExcalidraw.setScene([local])
    render(<App />)

    act(() => {
      socket().serverSends({
        type: 'change',
        from: 'another-client',
        elements: [remote],
      })
    })

    expect(mockExcalidraw.updateScene).toHaveBeenCalledWith({
      elements: [remote],
      captureUpdate: 'NEVER',
    })
  })
})
