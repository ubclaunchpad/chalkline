import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it, vi } from 'vitest'
import { mergeElements } from '../realtime/sceneSync.ts'
import { cardPartData, type CardPart } from './cardParts.ts'
import { planCardTextRepairs, type RepairedVersions } from './repairCardText.ts'

// The real package needs a browser canvas to load, so stand in for
// newElementWith: copy the element, apply the updates, bump the version and,
// like Excalidraw, pick a new versionNonce.
const nonces = vi.hoisted(() => ({ next: 1000 }))
vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: (element: OrderedExcalidrawElement, updates: object) => ({
    ...element,
    ...updates,
    version: element.version + 1,
    versionNonce: (nonces.next += 1),
  }),
}))

const database = (name: string, replicas: number) => ({
  v: 1,
  kind: 'database',
  name,
  props: { engine: 'PostgreSQL', replicas },
})

const element = (fields: Record<string, unknown>) =>
  ({
    isDeleted: false,
    groupIds: ['g1'],
    version: 1,
    versionNonce: 1,
    ...fields,
  }) as unknown as OrderedExcalidrawElement

const text = (part: CardPart, value: string, group = 'g1') =>
  element({
    id: `${group}-${part}`,
    type: 'text',
    groupIds: [group],
    text: value,
    originalText: value,
    customData: cardPartData(part),
  })

const container = (data: object, fields: Record<string, unknown> = {}) =>
  element({ id: 'box', type: 'rectangle', customData: data, ...fields })

const textOf = (elements: OrderedExcalidrawElement[], id: string) =>
  (elements.find((each) => each.id === id) as { text?: string } | undefined)
    ?.text

describe('planCardTextRepairs', () => {
  it('leaves a card whose text matches its data alone', () => {
    const scene = [
      container(database('orders', 1)),
      text('name', 'orders'),
      text('detail', 'PostgreSQL · 1 replica'),
    ]

    expect(planCardTextRepairs(scene, new Map())).toEqual([])
  })

  it('fixes the clash: data kept one edit, the name text kept the other', () => {
    // Alice renamed to "billing" while Bob set 3 replicas. Bob's container
    // won, Alice's name text survived, Bob's detail text survived.
    const scene = [
      container(database('orders', 3), { version: 2 }),
      text('name', 'billing'),
      text('detail', 'PostgreSQL · 3 replicas'),
    ]

    const changed = planCardTextRepairs(scene, new Map())

    expect(changed.map((each) => each.id)).toEqual(['g1-name'])
    expect(textOf(changed, 'g1-name')).toBe('orders')
  })

  it('fixes both lines when both are out of date', () => {
    const scene = [
      container(database('orders', 3)),
      text('name', 'old'),
      text('detail', 'old'),
    ]

    const changed = planCardTextRepairs(scene, new Map())

    expect(textOf(changed, 'g1-name')).toBe('orders')
    expect(textOf(changed, 'g1-detail')).toBe('PostgreSQL · 3 replicas')
  })

  it('repairs a card at most once per version of its data', () => {
    const repaired: RepairedVersions = new Map()
    const stale = [container(database('orders', 1)), text('name', 'billing')]

    expect(planCardTextRepairs(stale, repaired)).toHaveLength(1)
    // Someone else writes different text for the same data: no tug of war.
    expect(planCardTextRepairs(stale, repaired)).toEqual([])

    // New data is a new version, so it is checked again.
    const edited = [
      container(database('payments', 1), { version: 2 }),
      text('name', 'billing'),
    ]
    expect(textOf(planCardTextRepairs(edited, repaired), 'g1-name')).toBe(
      'payments',
    )
  })

  it('ignores old cards, deleted cards and invalid data', () => {
    expect(
      planCardTextRepairs(
        [container(database('orders', 1), { groupIds: [] })],
        new Map(),
      ),
    ).toEqual([])
    expect(
      planCardTextRepairs(
        [
          container(database('orders', 1), { isDeleted: true }),
          text('name', 'x'),
        ],
        new Map(),
      ),
    ).toEqual([])
    expect(
      planCardTextRepairs(
        [container({ v: 1, kind: 'database' }), text('name', 'x')],
        new Map(),
      ),
    ).toEqual([])
  })

  it('skips a group that holds two components', () => {
    const scene = [
      container(database('orders', 1)),
      container(database('billing', 1), { id: 'box2' }),
      text('name', 'something else'),
    ]

    expect(planCardTextRepairs(scene, new Map())).toEqual([])
  })

  it('checks each card on its own', () => {
    const scene = [
      container(database('orders', 1)),
      text('name', 'orders'),
      container(database('billing', 1), { id: 'box2', groupIds: ['g2'] }),
      text('name', 'stale', 'g2'),
    ]

    const changed = planCardTextRepairs(scene, new Map())

    expect(changed.map((each) => each.id)).toEqual(['g2-name'])
    expect(textOf(changed, 'g2-name')).toBe('billing')
  })
})

describe('planCardTextRepairs with a deleted part', () => {
  it('leaves a card alone when its name text was deleted', () => {
    const scene = [
      container(database('orders', 1)),
      { ...text('name', 'stale'), isDeleted: true },
      text('detail', 'PostgreSQL · 1 replica'),
    ]

    expect(planCardTextRepairs(scene, new Map())).toEqual([])
  })
})

describe('two windows editing one card at once', () => {
  // The card before either edit: container v5, text v3.
  const base = () =>
    [
      container(database('orders', 1), { version: 5, versionNonce: 50 }),
      text('name', 'orders'),
      text('detail', 'PostgreSQL · 1 replica'),
    ].map((each) =>
      each.id === 'box' ? each : { ...each, version: 3, versionNonce: 30 },
    )

  // Alice renames on the card; Bob changes replicas. Each writes the
  // container and one text line, both one version up from the same base.
  const alice = [
    container(database('billing', 1), { version: 6, versionNonce: 9 }),
    { ...text('name', 'billing'), version: 4, versionNonce: 90 },
  ]
  const bob = [
    container(database('orders', 3), { version: 6, versionNonce: 1 }),
    {
      ...text('detail', 'PostgreSQL · 3 replicas'),
      version: 4,
      versionNonce: 10,
    },
  ]

  it('ends with both windows showing the data the board kept', () => {
    // Each window applies its own edit, then receives the other's.
    let aliceWindow = mergeElements(mergeElements(base(), alice), bob)
    let bobWindow = mergeElements(mergeElements(base(), bob), alice)

    // Bob's container won the version tie (lower nonce), but Alice's name
    // text survived: both windows show "billing" for data named "orders".
    expect(textOf(aliceWindow, 'g1-name')).toBe('billing')
    expect(textOf(bobWindow, 'g1-name')).toBe('billing')

    // Both windows repair, then receive each other's repair.
    const aliceRepair = planCardTextRepairs(aliceWindow, new Map())
    const bobRepair = planCardTextRepairs(bobWindow, new Map())
    aliceWindow = mergeElements(
      mergeElements(aliceWindow, aliceRepair),
      bobRepair,
    )
    bobWindow = mergeElements(mergeElements(bobWindow, bobRepair), aliceRepair)

    for (const window of [aliceWindow, bobWindow]) {
      expect(textOf(window, 'g1-name')).toBe('orders')
      expect(textOf(window, 'g1-detail')).toBe('PostgreSQL · 3 replicas')
      expect(planCardTextRepairs(window, new Map())).toEqual([])
    }
    expect(aliceWindow).toEqual(bobWindow)
  })
})
