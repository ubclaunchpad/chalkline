import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import {
  changedElements,
  createRemoteUpdateTracker,
  mergeElements,
} from './sceneSync'

type RectangleElement = Extract<OrderedExcalidrawElement, { type: 'rectangle' }>

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

describe('changedElements', () => {
  it('returns only new, changed, and deleted elements', () => {
    const unchanged = rectangle({ id: 'unchanged' })
    const changedBefore = rectangle({ id: 'changed', versionNonce: 10 })
    const deletedBefore = rectangle({ id: 'deleted', versionNonce: 20 })

    const changedAfter = rectangle({
      id: 'changed',
      version: 2,
      versionNonce: 11,
      x: 40,
    })
    const deletedAfter = rectangle({
      id: 'deleted',
      version: 2,
      versionNonce: 21,
      isDeleted: true,
    })
    const added = rectangle({ id: 'added' })

    expect(
      changedElements(
        [unchanged, changedBefore, deletedBefore],
        [unchanged, changedAfter, deletedAfter, added],
      ),
    ).toEqual([changedAfter, deletedAfter, added])
  })

  it('detects an alternate edit with the same version and a different nonce', () => {
    const previous = rectangle({ id: 'shape', version: 3, versionNonce: 100 })
    const next = rectangle({ id: 'shape', version: 3, versionNonce: 200 })

    expect(changedElements([previous], [next])).toEqual([next])
  })
})

describe('mergeElements', () => {
  it('keeps the element with the higher version', () => {
    const older = rectangle({ id: 'shape', version: 2, versionNonce: 100 })
    const newer = rectangle({ id: 'shape', version: 3, versionNonce: 900 })

    expect(mergeElements([older], [newer])).toEqual([newer])
    expect(mergeElements([newer], [older])).toEqual([newer])
  })

  it('keeps the lower nonce when versions tie', () => {
    const higherNonce = rectangle({
      id: 'shape',
      version: 3,
      versionNonce: 900,
    })
    const lowerNonce = rectangle({
      id: 'shape',
      version: 3,
      versionNonce: 100,
    })

    expect(mergeElements([higherNonce], [lowerNonce])).toEqual([lowerNonce])
    expect(mergeElements([lowerNonce], [higherNonce])).toEqual([lowerNonce])
  })

  it('allows a higher-version edit to beat a deletion', () => {
    const deletion = rectangle({
      id: 'shape',
      version: 2,
      versionNonce: 10,
      isDeleted: true,
    })
    const edit = rectangle({
      id: 'shape',
      version: 3,
      versionNonce: 20,
      x: 50,
    })

    expect(mergeElements([deletion], [edit])).toEqual([edit])
  })

  it('returns the same scene regardless of update arrival order', () => {
    const firstEdit = rectangle({
      id: 'shape',
      version: 2,
      versionNonce: 800,
      x: 20,
    })
    const secondEdit = rectangle({
      id: 'shape',
      version: 2,
      versionNonce: 200,
      x: 80,
    })

    expect(mergeElements([firstEdit], [secondEdit])).toEqual(
      mergeElements([secondEdit], [firstEdit]),
    )
  })

  it('orders winners by fractional index and then id', () => {
    const last = rectangle({ id: 'last', index: 'c' })
    const tiedIndexB = rectangle({ id: 'b', index: 'b' })
    const tiedIndexA = rectangle({ id: 'a', index: 'b' })
    const first = rectangle({ id: 'first', index: 'a' })

    expect(mergeElements([last, tiedIndexB], [tiedIndexA, first])).toEqual([
      first,
      tiedIndexA,
      tiedIndexB,
      last,
    ])
  })

  it('does not mutate either input', () => {
    const local = Object.freeze([
      Object.freeze(rectangle({ id: 'local', index: 'b' })),
    ])
    const incoming = Object.freeze([
      Object.freeze(rectangle({ id: 'incoming', index: 'a' })),
    ])

    expect(() => mergeElements(local, incoming)).not.toThrow()
    expect(local.map((element) => element.id)).toEqual(['local'])
    expect(incoming.map((element) => element.id)).toEqual(['incoming'])
  })
})

describe('createRemoteUpdateTracker', () => {
  it('suppresses an exact remote version once', () => {
    const remote = rectangle({ id: 'shape', version: 2, versionNonce: 100 })
    const tracker = createRemoteUpdateTracker()

    tracker.remember([remote])

    expect(tracker.filter([remote])).toEqual([])
    expect(tracker.filter([remote])).toEqual([remote])
  })

  it('does not suppress a subsequent local edit', () => {
    const remote = rectangle({ id: 'shape', version: 2, versionNonce: 100 })
    const localEdit = rectangle({ id: 'shape', version: 3, versionNonce: 200 })
    const tracker = createRemoteUpdateTracker()

    tracker.remember([remote])

    expect(tracker.filter([localEdit])).toEqual([localEdit])
  })

  it('does not suppress an alternate edit with the same version', () => {
    const remote = rectangle({ id: 'shape', version: 2, versionNonce: 100 })
    const alternateEdit = rectangle({
      id: 'shape',
      version: 2,
      versionNonce: 200,
    })
    const tracker = createRemoteUpdateTracker()

    tracker.remember([remote])

    expect(tracker.filter([alternateEdit])).toEqual([alternateEdit])
  })

  it('can forget all remembered remote versions', () => {
    const remote = rectangle({ id: 'shape', version: 2, versionNonce: 100 })
    const tracker = createRemoteUpdateTracker()

    tracker.remember([remote])
    tracker.clear()

    expect(tracker.filter([remote])).toEqual([remote])
  })
})
