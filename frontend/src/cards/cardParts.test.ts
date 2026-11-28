import { describe, expect, it } from 'vitest'
import {
  cardPartData,
  componentIdInSelection,
  findCardContainer,
  findCardParts,
  isCard,
  readCardPart,
  type CardElement,
  type CardPart,
} from './cardParts.ts'

const database = {
  v: 1,
  kind: 'database',
  name: 'orders',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const element = (
  id: string,
  groupIds: string[],
  customData?: unknown,
  isDeleted = false,
): CardElement => ({ id, groupIds, customData, isDeleted })

const part = (id: string, group: string, kind: CardPart) =>
  element(id, [group], cardPartData(kind))

// A new card: container plus icon, name and detail in group g1.
const card = [
  element('box', ['g1'], database),
  part('icon', 'g1', 'icon'),
  part('name', 'g1', 'name'),
  part('detail', 'g1', 'detail'),
]

describe('readCardPart', () => {
  it('reads each part marker', () => {
    expect(readCardPart({ customData: cardPartData('name') })).toBe('name')
    expect(readCardPart({ customData: cardPartData('icon') })).toBe('icon')
  })

  it.each([
    undefined,
    null,
    'card',
    database,
    { annotation: 'card', part: 'border' },
    { annotation: 'group', part: 'name' },
  ])('is null for %j', (customData) => {
    expect(readCardPart({ customData })).toBeNull()
  })
})

describe('findCardParts', () => {
  it('finds the three parts of a card', () => {
    const parts = findCardParts(card, card[0])
    expect(parts.icon?.id).toBe('icon')
    expect(parts.name?.id).toBe('name')
    expect(parts.detail?.id).toBe('detail')
  })

  it('finds nothing for an old card without a group', () => {
    expect(findCardParts(card, element('old', [], database))).toEqual({})
  })

  it('ignores deleted parts and parts of other cards', () => {
    const elements = [
      element('box', ['g1'], database),
      element('name', ['g1'], cardPartData('name'), true),
      part('other', 'g2', 'name'),
    ]
    expect(findCardParts(elements, elements[0])).toEqual({})
  })

  it('still finds the parts when cards are grouped together', () => {
    const elements = [
      element('box', ['g1', 'outer'], database),
      element('name', ['g1', 'outer'], cardPartData('name')),
    ]
    expect(findCardParts(elements, elements[0]).name?.id).toBe('name')
  })
})

describe('isCard', () => {
  it('is true for a container with a name part', () => {
    expect(isCard(card, card[0])).toBe(true)
  })

  it('is false for an old card', () => {
    const old = element('old', [], database)
    expect(isCard([old], old)).toBe(false)
  })
})

describe('findCardContainer', () => {
  it('finds the component in the part’s group', () => {
    expect(findCardContainer(card, card[2])?.id).toBe('box')
  })

  it('is null when the container was deleted', () => {
    const elements = [element('box', ['g1'], database, true), card[2]]
    expect(findCardContainer(elements, card[2])).toBeNull()
  })

  it('is null when the group holds two components', () => {
    const elements = [...card, element('box2', ['g1'], database)]
    expect(findCardContainer(elements, card[2])).toBeNull()
  })
})

describe('componentIdInSelection', () => {
  const ids = (...list: string[]) =>
    Object.fromEntries(list.map((id) => [id, true as const]))

  it('returns the one selected element', () => {
    expect(componentIdInSelection(card, ids('box'))).toBe('box')
  })

  it('returns the container when a whole card is selected', () => {
    expect(
      componentIdInSelection(card, ids('box', 'icon', 'name', 'detail')),
    ).toBe('box')
  })

  it('is null for nothing selected', () => {
    expect(componentIdInSelection(card, {})).toBeNull()
  })

  it('is null for two cards', () => {
    const second = [
      element('box2', ['g2'], database),
      part('name2', 'g2', 'name'),
    ]
    expect(
      componentIdInSelection(
        [...card, ...second],
        ids('box', 'name', 'box2', 'name2'),
      ),
    ).toBeNull()
  })

  it('is null for a card plus another shape', () => {
    const elements = [...card, element('shape', [])]
    expect(
      componentIdInSelection(elements, ids('box', 'name', 'shape')),
    ).toBeNull()
  })

  it('is null when a selected element is missing or deleted', () => {
    expect(componentIdInSelection(card, ids('box', 'gone'))).toBeNull()
  })
})
