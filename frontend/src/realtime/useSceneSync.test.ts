import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSceneSyncController, type SceneSyncApi } from './useSceneSync'

type RectangleElement = Extract<OrderedExcalidrawElement, { type: 'rectangle' }>
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] }

const rectangle = ({
  id,
  index = id,
  version = 1,
  versionNonce = 1,
  isDeleted = false,
  x = 0,
}: {
  id: string
  index?: string
  version?: number
  versionNonce?: number
  isDeleted?: boolean
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
  versionNonce,
  index: index as RectangleElement['index'],
  isDeleted,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
})

interface Update {
  elements: readonly OrderedExcalidrawElement[]
  captureUpdate: 'NEVER'
}

const setup = (initialElements: readonly OrderedExcalidrawElement[]) => {
  let scene = initialElements
  let receiveHandler:
    ((elements: readonly OrderedExcalidrawElement[]) => void) | undefined
  let unsubscribed = false
  const sent: (readonly OrderedExcalidrawElement[])[] = []
  const updates: Update[] = []

  const api: SceneSyncApi = {
    getSceneElementsIncludingDeleted: () => scene,
    updateScene(update) {
      updates.push(update)
      scene = update.elements
    },
  }

  const controller = createSceneSyncController({
    api,
    send: (elements) => {
      sent.push(elements)
    },
    subscribe(handler) {
      receiveHandler = handler
      return () => {
        unsubscribed = true
        receiveHandler = undefined
      }
    },
  })

  return {
    controller,
    sent,
    updates,
    receive(elements: readonly OrderedExcalidrawElement[]) {
      receiveHandler?.(elements)
    },
    scene: () => scene,
    unsubscribed: () => unsubscribed,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSceneSyncController', () => {
  it('sends only the element that changed after 50 ms', () => {
    const first = rectangle({ id: 'first' })
    const second = rectangle({ id: 'second' })
    const changedFirst = rectangle({ id: 'first', version: 2, x: 20 })
    const sync = setup([first, second])

    sync.controller.onSceneChange([changedFirst, second])

    vi.advanceTimersByTime(49)
    expect(sync.sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sync.sent).toEqual([[changedFirst]])
  })

  it('batches the newest revisions of every changed element', () => {
    const first = rectangle({ id: 'first' })
    const second = rectangle({ id: 'second' })
    const firstEdit = rectangle({ id: 'first', version: 2, x: 10 })
    const latestFirstEdit = rectangle({ id: 'first', version: 3, x: 20 })
    const secondEdit = rectangle({ id: 'second', version: 2, x: 30 })
    const sync = setup([first, second])

    sync.controller.onSceneChange([firstEdit, second])
    vi.advanceTimersByTime(25)
    sync.controller.onSceneChange([latestFirstEdit, secondEdit])
    vi.advanceTimersByTime(25)

    expect(sync.sent).toEqual([[latestFirstEdit, secondEdit]])
  })

  it('keeps consecutive sends at least 50 ms apart', () => {
    const original = rectangle({ id: 'shape' })
    const firstEdit = rectangle({ id: 'shape', version: 2, x: 10 })
    const secondEdit = rectangle({ id: 'shape', version: 3, x: 20 })
    const sync = setup([original])

    sync.controller.onSceneChange([firstEdit])
    vi.advanceTimersByTime(50)
    sync.controller.onSceneChange([secondEdit])
    vi.advanceTimersByTime(49)

    expect(sync.sent).toEqual([[firstEdit]])
    vi.advanceTimersByTime(1)
    expect(sync.sent).toEqual([[firstEdit], [secondEdit]])
  })

  it('does not send when the scene has not changed', () => {
    const element = rectangle({ id: 'shape' })
    const sync = setup([element])

    sync.controller.onSceneChange([element])
    vi.advanceTimersByTime(50)

    expect(sync.sent).toEqual([])
  })

  it('sends a local deletion as a changed element', () => {
    const local = rectangle({ id: 'shape', version: 1 })
    const deletion = rectangle({ id: 'shape', version: 2, isDeleted: true })
    const sync = setup([local])

    sync.controller.onSceneChange([deletion])
    vi.advanceTimersByTime(50)

    expect(sync.sent).toEqual([[deletion]])
  })

  it('detects a later version when Excalidraw mutates an element in place', () => {
    const drawing = rectangle({ id: 'shape' }) as Mutable<RectangleElement>
    const sync = setup([])

    sync.controller.onSceneChange([drawing])
    vi.advanceTimersByTime(50)
    sync.sent.length = 0

    drawing.width = 100
    drawing.height = 100
    drawing.version = 2
    drawing.versionNonce = 2
    sync.controller.onSceneChange([drawing])
    vi.advanceTimersByTime(50)

    expect(sync.sent).toEqual([[drawing]])
  })

  it('applies a winning remote update outside local undo history', () => {
    const local = rectangle({ id: 'shape', version: 1, x: 10 })
    const remote = rectangle({ id: 'shape', version: 2, x: 20 })
    const sync = setup([local])

    sync.receive([remote])

    expect(sync.updates).toEqual([
      {
        elements: [remote],
        captureUpdate: 'NEVER',
      },
    ])
    expect(sync.scene()).toEqual([remote])
  })

  it('preserves unrelated local elements when applying a remote fragment', () => {
    const local = rectangle({ id: 'shape', index: 'a', version: 1 })
    const untouched = rectangle({ id: 'untouched', index: 'b' })
    const remote = rectangle({ id: 'shape', index: 'a', version: 2 })
    const sync = setup([local, untouched])

    sync.receive([remote])

    expect(sync.scene()).toEqual([remote, untouched])
  })

  it('does not echo a remote update reported by Excalidraw', () => {
    const local = rectangle({ id: 'shape', version: 1 })
    const remote = rectangle({ id: 'shape', version: 2 })
    const sync = setup([local])

    sync.receive([remote])
    sync.controller.onSceneChange(sync.scene())
    vi.advanceTimersByTime(50)

    expect(sync.sent).toEqual([])
  })

  it('sends a later local edit to a remotely updated element', () => {
    const local = rectangle({ id: 'shape', version: 1 })
    const remote = rectangle({ id: 'shape', version: 2, x: 20 })
    const localEdit = rectangle({ id: 'shape', version: 3, x: 30 })
    const sync = setup([local])

    sync.receive([remote])
    sync.controller.onSceneChange(sync.scene())
    sync.controller.onSceneChange([localEdit])
    vi.advanceTimersByTime(50)

    expect(sync.sent).toEqual([[localEdit]])
  })

  it('ignores a losing remote update', () => {
    const local = rectangle({ id: 'shape', version: 3, x: 30 })
    const remote = rectangle({ id: 'shape', version: 2, x: 20 })
    const sync = setup([local])

    sync.receive([remote])

    expect(sync.updates).toEqual([])
    expect(sync.scene()).toEqual([local])
  })

  it('applies and suppresses a remote deletion', () => {
    const local = rectangle({ id: 'shape', version: 1 })
    const deletion = rectangle({ id: 'shape', version: 2, isDeleted: true })
    const sync = setup([local])

    sync.receive([deletion])
    sync.controller.onSceneChange(sync.scene())
    vi.advanceTimersByTime(50)

    expect(sync.scene()).toEqual([deletion])
    expect(sync.sent).toEqual([])
  })

  it('unsubscribes and cancels pending sends when disposed', () => {
    const local = rectangle({ id: 'shape', version: 1 })
    const localEdit = rectangle({ id: 'shape', version: 2 })
    const remote = rectangle({ id: 'remote', version: 1 })
    const sync = setup([local])

    sync.controller.onSceneChange([localEdit])
    sync.controller.dispose()
    sync.receive([remote])
    vi.advanceTimersByTime(50)

    expect(sync.unsubscribed()).toBe(true)
    expect(sync.sent).toEqual([])
    expect(sync.updates).toEqual([])
  })
})
