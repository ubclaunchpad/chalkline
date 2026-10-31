// @vitest-environment jsdom
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { FakeWebSocket } from './realtime/fakeWebSocket'

interface MockExcalidrawProps {
  excalidrawAPI?: (api: ExcalidrawImperativeAPI) => void
  onChange?: (elements: readonly OrderedExcalidrawElement[]) => void
}

const mockExcalidraw = vi.hoisted(() => {
  let scene: readonly OrderedExcalidrawElement[] = []
  const updateScene = vi.fn(
    ({ elements }: { elements: readonly OrderedExcalidrawElement[] }) => {
      scene = elements
    },
  )

  return {
    api: {
      getSceneElementsIncludingDeleted: () => scene,
      updateScene,
    } as unknown as ExcalidrawImperativeAPI,
    updateScene,
    props: null as MockExcalidrawProps | null,
    reset() {
      scene = []
      this.props = null
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
    Excalidraw(props: MockExcalidrawProps) {
      mockExcalidraw.props = props
      const { excalidrawAPI } = props
      useEffect(() => {
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
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  window.history.replaceState(null, '', '/?board=team')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('App scene synchronization', () => {
  it('sends local changes through the one shared board connection', () => {
    render(<App />)
    expect(FakeWebSocket.instances).toHaveLength(1)

    const local = rectangle({ id: 'local' })
    mockExcalidraw.setScene([local])

    act(() => {
      socket().serverOpens()
      mockExcalidraw.props?.onChange?.([local])
      vi.advanceTimersByTime(50)
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
