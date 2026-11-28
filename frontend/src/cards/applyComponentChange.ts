// One entry point for changing a component's name or settings, from the
// settings panel or from the card on the board. It validates the change with
// updateComponent and, for a new card, also rewrites the card's name and
// detail lines. The caller writes everything returned in a single
// updateScene, so the change is one undo step and one sync message, and only
// the window where the person typed writes it (other windows just receive it).

import { newElementWith } from '@excalidraw/excalidraw'
import type {
  ExcalidrawTextElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types'
import {
  readComponent,
  updateComponent,
  type ComponentChange,
} from '../properties/updateComponent.ts'
import { cardTexts } from './cardLook.ts'
import { findCardParts } from './cardParts.ts'

export type ChangeResult =
  | { ok: true; elements: OrderedExcalidrawElement[] }
  | { ok: false; problems: string[] }

const NOT_A_COMPONENT = 'element is not a component'

/**
 * The card's name and detail text elements whose text does not match the
 * container's data, rewritten to match. Empty for old cards, plain shapes and
 * cards that already match.
 */
export function refreshCardText(
  elements: readonly OrderedExcalidrawElement[],
  container: OrderedExcalidrawElement,
): OrderedExcalidrawElement[] {
  const data = readComponent(container)
  if (!data) {
    return []
  }
  const parts = findCardParts(elements, container)
  const texts = cardTexts(data)
  const changed: OrderedExcalidrawElement[] = []

  for (const part of ['name', 'detail'] as const) {
    const element = parts[part]
    const text = texts[part]
    if (element?.type === 'text' && element.text !== text) {
      // Width and height stay as they are: each line has a fixed width and
      // the fitted text is always one line.
      changed.push(
        newElementWith(element as ExcalidrawTextElement, {
          text,
          originalText: text,
        }) as OrderedExcalidrawElement,
      )
    }
  }
  return changed
}

/**
 * Validates and applies a change to the component `containerId`. Returns the
 * elements to write (none for a change that changes nothing), or the
 * validator's problems, which the panel shows next to each field.
 */
export function applyComponentChange(
  elements: readonly OrderedExcalidrawElement[],
  containerId: string,
  change: ComponentChange,
): ChangeResult {
  const container = elements.find(
    (element) => element.id === containerId && !element.isDeleted,
  )
  if (!container) {
    return { ok: false, problems: [NOT_A_COMPONENT] }
  }

  const result = updateComponent(container, change)
  if (!result.ok) {
    return result
  }
  if (result.element === container) {
    return { ok: true, elements: [] }
  }
  return {
    ok: true,
    elements: [result.element, ...refreshCardText(elements, result.element)],
  }
}

/** `elements` with each changed element swapped in by id. */
export function withChanges<T extends { id: string }>(
  elements: readonly T[],
  changed: readonly T[],
): T[] {
  const byId = new Map(changed.map((element) => [element.id, element]))
  return elements.map((element) => byId.get(element.id) ?? element)
}
