// @vitest-environment jsdom
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardPartData } from './cardParts.ts'
import { useCardTextRepair } from './useCardTextRepair.ts'

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { NEVER: 'NEVER' },
  newElementWith: (element: OrderedExcalidrawElement, updates: object) => ({
    ...element,
    ...updates,
    version: element.version + 1,
  }),
}))

const element = (fields: Record<string, unknown>) =>
  ({
    isDeleted: false,
    groupIds: ['g1'],
    version: 1,
    versionNonce: 1,
    ...fields,
  }) as unknown as OrderedExcalidrawElement

const container = (name: string, fields: Record<string, unknown> = {}) =>
  element({
    id: 'box',
    type: 'rectangle',
    customData: {
      v: 1,
      kind: 'database',
      name,
      props: { engine: 'PostgreSQL', replicas: 1 },
    },
    ...fields,
  })

const nameText = (shown: string) =>
  element({
    id: 'name',
    type: 'text',
    text: shown,
    originalText: shown,
    customData: cardPartData('name'),
  })

let scene: OrderedExcalidrawElement[] = []
let listeners: (() => void)[] = []
const updateScene = vi.fn(
  ({ elements }: { elements: OrderedExcalidrawElement[] }) => {
    scene = elements
  },
)
const api = {
  getSceneElementsIncludingDeleted: () => scene,
  updateScene,
  onChange: (listener: () => void) => {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter((each) => each !== listener)
    }
  },
} as unknown as ExcalidrawImperativeAPI

const boardChanged = () => {
  for (const listener of listeners) listener()
}

// Animation frames wait until the test runs them, like a real browser.
let frames: FrameRequestCallback[] = []
const runFrames = () => {
  const queued = frames
  frames = []
  for (const callback of queued) callback(0)
}

const shownName = () =>
  (scene.find((each) => each.id === 'name') as unknown as { text: string }).text

const mount = () =>
  renderHook(() => {
    useCardTextRepair(api)
  })

beforeEach(() => {
  frames = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames = frames.filter((_, index) => index + 1 !== id)
  })
  listeners = []
  updateScene.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useCardTextRepair', () => {
  it('fixes a card that is wrong when the board opens, outside undo', () => {
    scene = [container('orders'), nameText('billing')]
    mount()

    expect(shownName()).toBe('orders')
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: 'NEVER' }),
    )
  })

  it('fixes a card after a clash swaps in data with the same version', () => {
    scene = [
      container('billing', { version: 6, versionNonce: 9 }),
      nameText('billing'),
    ]
    mount()
    expect(updateScene).not.toHaveBeenCalled()

    // The other person's edit won the tie: same version, lower nonce.
    scene = [
      container('orders', { version: 6, versionNonce: 1 }),
      nameText('billing'),
    ]
    boardChanged()
    runFrames()

    expect(shownName()).toBe('orders')
  })

  it('checks once per frame however many changes arrive', () => {
    scene = [container('orders'), nameText('orders')]
    mount()
    scene = [container('payments', { version: 2 }), nameText('orders')]
    boardChanged()
    boardChanged()
    boardChanged()

    expect(frames).toHaveLength(1)
    runFrames()
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(shownName()).toBe('payments')
  })

  it('writes nothing more once the card matches', () => {
    scene = [container('orders'), nameText('billing')]
    mount()
    expect(updateScene).toHaveBeenCalledTimes(1)

    // The repair's own write comes back as a board change.
    boardChanged()
    runFrames()

    expect(updateScene).toHaveBeenCalledTimes(1)
  })

  it('stops listening and drops a waiting check when unmounted', () => {
    scene = [container('orders'), nameText('orders')]
    const { unmount } = mount()
    scene = [container('payments', { version: 2 }), nameText('orders')]
    boardChanged()
    unmount()
    runFrames()

    expect(listeners).toEqual([])
    expect(updateScene).not.toHaveBeenCalled()
  })
})
