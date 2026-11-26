import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import { iconFileId, iconIdFor } from './icons'
import { planEffects, type PlanInput } from './plan'

// Just the fields planEffects reads; the cast keeps fixtures short.
const el = (fields: Record<string, unknown>) =>
  ({ isDeleted: false, boundElements: null, ...fields }) as ExcalidrawElement

const db = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 2 },
}
const card = (id: string, extra: Record<string, unknown> = {}) =>
  el({
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    customData: db,
    boundElements: [{ type: 'text', id: `${id}-text` }],
    ...extra,
  })
const text = (id: string, containerId: string, originalText: string) =>
  el({ id, type: 'text', containerId, originalText, text: originalText })
const icon = (cardId: string, extra: Record<string, unknown> = {}) =>
  el({
    id: iconIdFor(cardId),
    type: 'image',
    x: 88,
    y: 14,
    fileId: iconFileId('database'),
    ...extra,
  })
const LABEL = 'Users DB\nPostgreSQL · 2 replicas'
const labelled = (id: string, label: string) => [
  card(id),
  text(`${id}-text`, id, label),
  icon(id),
]

const input = (extra: Partial<PlanInput> = {}): PlanInput => ({
  editingId: null,
  finishedId: null,
  busyIds: new Set(),
  seen: new Map(),
  ...extra,
})

describe('planEffects: cards', () => {
  it('leaves a card alone when its label and icon are right', () => {
    const plan = planEffects(
      labelled('a', 'Users DB\nPostgreSQL · 2 replicas'),
      input(),
    )
    expect(plan.patches.size).toBe(0)
    expect(plan.labels).toEqual([])
    expect(plan.icons).toEqual([])
  })

  it('rewrites the label when the name or settings change', () => {
    const plan = planEffects(labelled('a', 'Old name\nkind'), input())
    expect(plan.labels).toEqual([
      expect.objectContaining({
        containerId: 'a',
        text: 'Users DB\nPostgreSQL · 2 replicas',
      }),
    ])
  })

  it('does not rewrite a label someone else is typing into', () => {
    const seen = new Map([['a', 'Users DB\nPostgreSQL · 2 replicas']])
    const plan = planEffects(labelled('a', 'Users D'), input({ seen }))
    expect(plan.labels).toEqual([])
  })

  it('does not touch the label this client is editing', () => {
    const plan = planEffects(
      labelled('a', 'typing'),
      input({ editingId: 'a-text' }),
    )
    expect(plan.labels).toEqual([])
  })

  it('takes the first line as the new name after this client edits it', () => {
    const seen = new Map([['a', 'Users DB\nPostgreSQL · 2 replicas']])
    const plan = planEffects(
      labelled('a', 'Orders DB\nwhatever'),
      input({ finishedId: 'a-text', seen }),
    )
    expect(plan.patches.get('a')).toEqual({
      customData: { ...db, name: 'Orders DB' },
    })
    expect(plan.labels[0]?.text).toBe('Orders DB\nPostgreSQL · 2 replicas')
  })

  it('keeps the name and restores the label when the edit leaves it empty', () => {
    const seen = new Map([['a', 'Users DB\nPostgreSQL · 2 replicas']])
    const elements = [
      card('a'),
      el({ ...text('a-text', 'a', ''), isDeleted: true }),
      icon('a'),
    ]
    const plan = planEffects(elements, input({ finishedId: 'a-text', seen }))
    expect(plan.patches.has('a')).toBe(false)
    expect(plan.labels[0]?.text).toBe('Users DB\nPostgreSQL · 2 replicas')
  })

  it('adds a missing icon at the top centre of the card', () => {
    const plan = planEffects([card('a', { x: 100, y: 50 })], input())
    expect(plan.icons).toEqual([
      { cardId: 'a', kind: 'database', x: 188, y: 64 },
    ])
  })

  it('moves the icon with its card and brings back a deleted one', () => {
    const plan = planEffects(
      [card('a', { x: 10 }), icon('a', { isDeleted: true })],
      input(),
    )
    expect(plan.patches.get(iconIdFor('a'))).toMatchObject({
      x: 98,
      y: 14,
      isDeleted: false,
    })
  })

  it('deletes an icon whose card is gone', () => {
    const plan = planEffects(
      [card('a', { isDeleted: true }), icon('a')],
      input(),
    )
    expect(plan.patches.get(iconIdFor('a'))).toEqual({ isDeleted: true })
  })
})

describe('planEffects: connections', () => {
  const arrow = (extra: Record<string, unknown> = {}) =>
    el({
      id: 'r',
      type: 'arrow',
      startBinding: { elementId: 'a' },
      endBinding: { elementId: 'b' },
      strokeStyle: 'solid',
      startArrowhead: null,
      endArrowhead: 'arrow',
      ...extra,
    })
  const twoCards = [...labelled('a', LABEL), ...labelled('b', LABEL)]

  it('marks an arrow between two components as a call', () => {
    const plan = planEffects([...twoCards, arrow()], input())
    expect(plan.patches.get('r')).toMatchObject({
      customData: { v: 1, annotation: 'connection', kind: 'call' },
      strokeStyle: 'solid',
      endArrowhead: 'arrow',
    })
  })

  it('keeps a label typed on the arrow before it was connected', () => {
    const plan = planEffects(
      [
        ...twoCards,
        arrow({ boundElements: [{ type: 'text', id: 'r-text' }] }),
        text('r-text', 'r', 'HTTPS'),
      ],
      input(),
    )
    expect(plan.patches.get('r')).toMatchObject({
      customData: { kind: 'call', label: 'HTTPS' },
    })
  })

  it('ignores arrows with a free end, arrows being drawn, and plain shapes', () => {
    const free = arrow({ endBinding: null })
    expect(planEffects([...twoCards, free], input()).patches.has('r')).toBe(
      false,
    )
    const busy = input({ busyIds: new Set(['r']) })
    expect(planEffects([...twoCards, arrow()], busy).patches.has('r')).toBe(
      false,
    )
    const toShape = [
      ...labelled('a', LABEL),
      el({ id: 'b', type: 'rectangle' }),
      arrow(),
    ]
    expect(planEffects(toShape, input()).patches.has('r')).toBe(false)
  })

  it('restyles an arrow when its kind changes', () => {
    const data = { v: 1, annotation: 'connection', kind: 'two-way' }
    const plan = planEffects(
      [...twoCards, arrow({ customData: data })],
      input(),
    )
    expect(plan.patches.get('r')).toEqual({
      strokeStyle: 'solid',
      startArrowhead: 'arrow',
      endArrowhead: 'arrow',
    })
  })

  it('writes nothing when the style already matches', () => {
    const data = { v: 1, annotation: 'connection', kind: 'call' }
    const plan = planEffects(
      [...twoCards, arrow({ customData: data })],
      input(),
    )
    expect(plan.patches.has('r')).toBe(false)
    expect(plan.labels).toEqual([])
  })

  it('shows the label from the data and removes it when cleared', () => {
    const data = { v: 1, annotation: 'connection', kind: 'call', label: 'gRPC' }
    const seen = new Map<string, string>()
    const added = planEffects(
      [...twoCards, arrow({ customData: data })],
      input({ seen }),
    )
    expect(added.labels).toEqual([
      expect.objectContaining({ containerId: 'r', text: 'gRPC' }),
    ])

    const cleared = planEffects(
      [
        ...twoCards,
        arrow({
          customData: { ...data, label: undefined },
          boundElements: [{ type: 'text', id: 'r-text' }],
        }),
        text('r-text', 'r', 'gRPC'),
      ],
      input({ seen }),
    )
    expect(cleared.labels).toEqual([
      expect.objectContaining({ containerId: 'r', text: '' }),
    ])
  })

  it('saves a label typed on the arrow into its data', () => {
    const data = { v: 1, annotation: 'connection', kind: 'async' }
    const plan = planEffects(
      [
        ...twoCards,
        arrow({
          customData: data,
          strokeStyle: 'dashed',
          boundElements: [{ type: 'text', id: 'r-text' }],
        }),
        text('r-text', 'r', 'orders.created'),
      ],
      input({ finishedId: 'r-text' }),
    )
    expect(plan.patches.get('r')).toEqual({
      customData: { ...data, label: 'orders.created' },
    })
    expect(plan.labels).toEqual([])
  })
})

describe('planEffects: groups', () => {
  const group = (name: string) =>
    el({
      id: 'g',
      type: 'rectangle',
      customData: { v: 1, annotation: 'group', kind: 'vpc', name },
      boundElements: [{ type: 'text', id: 'g-text' }],
    })

  it('follows a rename from the data', () => {
    const plan = planEffects(
      [group('Prod VPC'), text('g-text', 'g', 'VPC')],
      input(),
    )
    expect(plan.labels[0]).toMatchObject({ containerId: 'g', text: 'Prod VPC' })
  })

  it('saves a name typed into the label', () => {
    const plan = planEffects(
      [group('VPC'), text('g-text', 'g', 'Staging')],
      input({ finishedId: 'g-text', seen: new Map([['g', 'VPC']]) }),
    )
    expect(plan.patches.get('g')).toMatchObject({
      customData: { name: 'Staging' },
    })
  })
})
