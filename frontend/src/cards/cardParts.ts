// A new component card is one Excalidraw group: the container that holds the
// component's customData, plus locked decorations (icon, name, detail). The
// decorations carry a small `annotation` marker so they can be found and so
// the graph skips them. Old boards have plain containers with no parts and
// are left alone.

import type { ComponentData } from '../catalog/catalog.ts'
import { validateComponent } from '../catalog/validate.ts'

export type CardPart = 'icon' | 'name' | 'detail'

const CARD_PARTS: readonly string[] = ['icon', 'name', 'detail']

export interface CardPartData {
  v: 1
  annotation: 'card'
  part: CardPart
}

/** The fields of an element these helpers read. */
export interface CardElement {
  id: string
  isDeleted: boolean
  groupIds: readonly string[]
  customData?: unknown
}

export function cardPartData(part: CardPart): CardPartData {
  return { v: 1, annotation: 'card', part }
}

/** Which card part an element is, or null for anything else. */
export function readCardPart(element: {
  customData?: unknown
}): CardPart | null {
  const data = element.customData
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const { annotation, part } = data as Record<string, unknown>
  return annotation === 'card' &&
    typeof part === 'string' &&
    CARD_PARTS.includes(part)
    ? (part as CardPart)
    : null
}

// The card's own group is the innermost one. Excalidraw appends outer groups
// (when people group cards together) after it.
const cardGroupOf = (element: CardElement): string | undefined =>
  element.groupIds.at(0)

const isComponent = (element: CardElement): boolean =>
  validateComponent(element.customData).ok

/** The live parts in a container's card group; empty for an old card. */
export function findCardParts<T extends CardElement>(
  elements: readonly T[],
  container: CardElement,
): Partial<Record<CardPart, T>> {
  const group = cardGroupOf(container)
  const parts: Partial<Record<CardPart, T>> = {}
  if (group === undefined) {
    return parts
  }
  for (const element of elements) {
    const part = readCardPart(element)
    if (
      part !== null &&
      !element.isDeleted &&
      cardGroupOf(element) === group &&
      parts[part] === undefined
    ) {
      parts[part] = element
    }
  }
  return parts
}

/** True for a container drawn as a new card (it has a live name part). */
export function isCard(
  elements: readonly CardElement[],
  container: CardElement,
): boolean {
  return findCardParts(elements, container).name !== undefined
}

/**
 * The component container a part belongs to: the one live component in the
 * part's card group. Null if there is none, or more than one.
 */
export function findCardContainer<T extends CardElement>(
  elements: readonly T[],
  part: CardElement,
): T | null {
  const group = cardGroupOf(part)
  if (group === undefined) {
    return null
  }
  const containers = elements.filter(
    (element) =>
      !element.isDeleted &&
      cardGroupOf(element) === group &&
      readCardPart(element) === null &&
      isComponent(element),
  )
  return containers.length === 1 ? containers[0] : null
}

/**
 * The id of the one component the selection stands for: a single selected
 * element, or a card selected as a whole (its container plus its parts).
 * Null for anything else.
 */
export function componentIdInSelection(
  elements: readonly CardElement[],
  selectedElementIds: Readonly<Record<string, true>>,
): string | null {
  const ids = Object.keys(selectedElementIds)
  if (ids.length === 1) {
    return ids[0]
  }

  const byId = new Map(elements.map((element) => [element.id, element]))
  const selected = ids.map((id) => byId.get(id))
  if (selected.some((element) => !element || element.isDeleted)) {
    return null
  }
  const live = selected as CardElement[]

  const containers = live.filter((element) => readCardPart(element) === null)
  if (containers.length !== 1) {
    return null
  }
  const [container] = containers
  const group = cardGroupOf(container)
  const allInCard = live.every(
    (element) =>
      element === container ||
      (readCardPart(element) !== null && cardGroupOf(element) === group),
  )
  return group !== undefined && allInCard ? container.id : null
}

interface Positioned extends CardElement {
  x: number
  y: number
  width: number
  height: number
  angle: number
}

const contains = (element: Positioned, point: { x: number; y: number }) =>
  point.x >= element.x &&
  point.x <= element.x + element.width &&
  point.y >= element.y &&
  point.y <= element.y + element.height

/**
 * The card at a scene point, if the topmost element there is a card or one
 * of its parts, and whether the point is on the card's name line. Null when
 * something else (another shape, an arrow) is on top. Only unrotated
 * elements count, so rotated cards are left to Excalidraw.
 */
export function cardAt<T extends Positioned>(
  elements: readonly T[],
  point: { x: number; y: number },
): { container: T; data: ComponentData; onName: boolean } | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element.isDeleted || element.angle !== 0 || !contains(element, point)) {
      continue
    }
    const part = readCardPart(element)
    const container =
      part === null
        ? isCard(elements, element)
          ? element
          : null
        : findCardContainer(elements, element)
    const result = container && validateComponent(container.customData)
    if (!container || !result?.ok) {
      return null
    }
    const name = findCardParts(elements, container).name
    return {
      container,
      data: result.data,
      onName: name?.angle === 0 && contains(name, point),
    }
  }
  return null
}
