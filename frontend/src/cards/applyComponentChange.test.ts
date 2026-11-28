import { newElementWith } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyComponentChange,
  refreshCardText,
  withChanges,
} from './applyComponentChange.ts'
import { cardPartData, type CardPart } from './cardParts.ts'

// The real package needs a browser canvas to load, so stand in for
// newElementWith: copy the element, apply the updates, bump the version.
vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: vi.fn(
    (element: OrderedExcalidrawElement, updates: object) => ({
      ...element,
      ...updates,
      version: element.version + 1,
    }),
  ),
}))

beforeEach(() => {
  vi.mocked(newElementWith).mockClear()
})

const database = {
  v: 1,
  kind: 'database',
  name: 'orders',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

// Only the fields these functions read; the rest of an Excalidraw element is
// irrelevant here.
const element = (fields: Record<string, unknown>): OrderedExcalidrawElement =>
  ({
    isDeleted: false,
    groupIds: [],
    version: 1,
    ...fields,
  }) as unknown as OrderedExcalidrawElement

const text = (id: string, part: CardPart, value: string) =>
  element({
    id,
    type: 'text',
    groupIds: ['g1'],
    text: value,
    originalText: value,
    width: 180,
    customData: cardPartData(part),
  })

const newCard = () => [
  element({
    id: 'box',
    type: 'rectangle',
    groupIds: ['g1'],
    customData: database,
  }),
  element({
    id: 'icon',
    type: 'image',
    groupIds: ['g1'],
    customData: cardPartData('icon'),
  }),
  text('name', 'name', 'orders'),
  text('detail', 'detail', 'PostgreSQL · 1 replica'),
]

const oldCard = () => [
  element({ id: 'old', type: 'rectangle', customData: database }),
]

const byId = (elements: OrderedExcalidrawElement[]) =>
  Object.fromEntries(elements.map((each) => [each.id, each])) as Record<
    string,
    OrderedExcalidrawElement & { text?: string; customData?: unknown }
  >

describe('applyComponentChange', () => {
  it('renames the component and its name line together', () => {
    const result = applyComponentChange(newCard(), 'box', {
      name: 'billing',
    })
    if (!result.ok) throw new Error(result.problems.join())

    const changed = byId(result.elements)
    expect(Object.keys(changed).sort()).toEqual(['box', 'name'])
    expect(changed.box.customData).toMatchObject({ name: 'billing' })
    expect(changed.name.text).toBe('billing')
    expect(changed.name).toMatchObject({ originalText: 'billing', width: 180 })
    expect(changed.name.version).toBe(2)
  })

  it('updates the detail line when a setting changes', () => {
    const result = applyComponentChange(newCard(), 'box', {
      props: { replicas: 3 },
    })
    if (!result.ok) throw new Error(result.problems.join())

    const changed = byId(result.elements)
    expect(Object.keys(changed).sort()).toEqual(['box', 'detail'])
    expect(changed.detail.text).toBe('PostgreSQL · 3 replicas')
  })

  it('shortens a long name on the card but keeps it whole in the data', () => {
    const result = applyComponentChange(newCard(), 'box', {
      name: 'Primary orders database',
    })
    if (!result.ok) throw new Error(result.problems.join())

    const changed = byId(result.elements)
    expect(changed.box.customData).toMatchObject({
      name: 'Primary orders database',
    })
    expect(changed.name.text).toBe('Primary orders databa…')
  })

  it('returns the validator’s problems and changes nothing', () => {
    const result = applyComponentChange(newCard(), 'box', { name: '  ' })

    expect(result).toEqual({ ok: false, problems: ['name is required'] })
    expect(newElementWith).not.toHaveBeenCalled()
  })

  it('returns nothing to write for a change that changes nothing', () => {
    expect(applyComponentChange(newCard(), 'box', { name: 'orders' })).toEqual({
      ok: true,
      elements: [],
    })
  })

  it('changes only the data of an old card', () => {
    const result = applyComponentChange(oldCard(), 'old', { name: 'billing' })
    if (!result.ok) throw new Error(result.problems.join())

    expect(result.elements.map((each) => each.id)).toEqual(['old'])
  })

  it('refuses a missing, deleted or non-component element', () => {
    const elements = [
      ...newCard(),
      element({
        id: 'gone',
        type: 'rectangle',
        customData: database,
        isDeleted: true,
      }),
    ]
    const problems = { ok: false, problems: ['element is not a component'] }

    expect(applyComponentChange(elements, 'missing', { name: 'x' })).toEqual(
      problems,
    )
    expect(applyComponentChange(elements, 'gone', { name: 'x' })).toEqual(
      problems,
    )
    expect(applyComponentChange(elements, 'icon', { name: 'x' })).toEqual(
      problems,
    )
  })
})

describe('refreshCardText', () => {
  it('rewrites card text that does not match the data', () => {
    const elements = newCard()
    elements[2] = text('name', 'name', 'stale name')

    expect(
      refreshCardText(elements, elements[0]).map((each) => each.id),
    ).toEqual(['name'])
  })

  it('returns nothing when the text already matches', () => {
    const elements = newCard()
    expect(refreshCardText(elements, elements[0])).toEqual([])
  })
})

describe('withChanges', () => {
  it('swaps changed elements in by id and keeps the order', () => {
    const elements = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
      { id: 'c', v: 1 },
    ]

    expect(withChanges(elements, [{ id: 'b', v: 2 }])).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 1 },
    ])
  })
})
