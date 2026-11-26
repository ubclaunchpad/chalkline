import { describe, expect, it, vi } from 'vitest'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  addReply,
  createThread,
  initials,
  newMessage,
  openThreads,
  pinPoint,
  readComment,
  setResolved,
  targetAt,
  threadsOf,
} from './comments'

// The real package needs a browser canvas to load. These stand-ins build
// elements and bump versions like the real ones.
vi.mock('@excalidraw/excalidraw', () => ({
  convertToExcalidrawElements: (skeletons: object[]) =>
    skeletons.map((skeleton) => ({
      id: crypto.randomUUID(),
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      ...skeleton,
    })),
  newElementWith: (element: ExcalidrawElement, updates: object) => ({
    ...element,
    ...updates,
    version: element.version + 1,
  }),
}))

const alice = { name: 'Alice Smith', color: '#a5c4f7' }

function box(id: string, x: number, y: number, extra = {}) {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: 100,
    height: 60,
    isDeleted: false,
    locked: false,
    ...extra,
  } as unknown as ExcalidrawElement
}

describe('comment threads', () => {
  it('creates a locked, invisible pin that carries the thread', () => {
    const element = createThread(
      { x: 50, y: 40 },
      'api',
      newMessage(alice, '  Is this cached?  ', 1000),
    )
    expect(element.type).toBe('ellipse')
    expect(element.locked).toBe(true)
    expect(element.opacity).toBe(0)
    expect(readComment(element)).toMatchObject({
      v: 1,
      annotation: 'comment',
      targetId: 'api',
      resolved: false,
      messages: [
        { author: 'Alice Smith', color: '#a5c4f7', text: 'Is this cached?' },
      ],
    })
  })

  it('replies and resolves as new versions, so the change syncs', () => {
    const element = createThread({ x: 0, y: 0 }, undefined, {
      ...newMessage(alice, 'first'),
    })
    const [thread] = threadsOf([element])
    const replied = addReply(thread, newMessage(alice, 'second'))
    expect(replied.version).toBe(element.version + 1)
    expect(readComment(replied)?.messages.map((m) => m.text)).toEqual([
      'first',
      'second',
    ])
    const [again] = threadsOf([replied])
    const resolved = setResolved(again, true)
    expect(readComment(resolved)?.resolved).toBe(true)
    expect(openThreads(threadsOf([resolved]))).toEqual([])
  })

  it('ignores elements whose comment data is missing or malformed', () => {
    const bad = [
      box('a', 0, 0),
      box('b', 0, 0, { customData: { v: 1, annotation: 'comment' } }),
      box('c', 0, 0, {
        customData: {
          v: 1,
          annotation: 'comment',
          resolved: false,
          messages: [{ id: 'm', author: 'x', text: 1 }],
        },
      }),
      box('d', 0, 0, { customData: { v: 1, kind: 'database' } }),
    ]
    expect(threadsOf(bad)).toEqual([])
  })

  it('skips deleted threads and sorts by the first message', () => {
    const late = createThread({ x: 0, y: 0 }, undefined, {
      ...newMessage(alice, 'late', 2000),
    })
    const early = createThread({ x: 0, y: 0 }, undefined, {
      ...newMessage(alice, 'early', 1000),
    })
    const gone = { ...early, id: 'gone', isDeleted: true }
    expect(threadsOf([late, early, gone]).map((t) => t.id)).toEqual([
      early.id,
      late.id,
    ])
  })
})

describe('placing pins', () => {
  it('targets the topmost card under the point, skipping labels and arrows', () => {
    const back = box('group', -50, -50, { width: 400, height: 400 })
    const card = box('card', 0, 0)
    const label = box('label', 10, 10, { type: 'text' })
    const arrow = box('arrow', 0, 0, { type: 'arrow' })
    const pin = box('pin', 0, 0, { locked: true })
    const scene = [back, card, label, arrow, pin]
    expect(targetAt(scene, 20, 20)?.id).toBe('card')
    expect(targetAt(scene, 300, 300)?.id).toBe('group')
    expect(targetAt(scene, 1000, 1000)).toBeUndefined()
  })

  it('follows its target and falls back to where it was dropped', () => {
    const element = createThread({ x: 500, y: 500 }, 'card', {
      ...newMessage(alice, 'hi'),
    })
    const [thread] = threadsOf([element])
    const moved = box('card', 200, 100)
    expect(pinPoint(thread, new Map([['card', moved]]))).toEqual({
      x: 300,
      y: 100,
    })
    expect(pinPoint(thread, new Map())).toEqual({ x: 500, y: 500 })
  })

  it('shows up to two initials', () => {
    expect(initials('Alice Smith Jones')).toBe('AS')
    expect(initials('  bob ')).toBe('B')
    expect(initials('😀 Zed')).toBe('😀Z')
  })
})
