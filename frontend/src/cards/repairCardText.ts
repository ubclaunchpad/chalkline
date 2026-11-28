// Keeps every card's name and detail text equal to its component data.
//
// Edits normally write the data and the card text together, so they match.
// But the board settles clashes one element at a time ("higher version
// wins"): if two people edit the same card at once, the container (the data)
// can end up with one person's change while a text element keeps the other's,
// so the card shows a name its data no longer has. Any window that sees such
// a card rewrites the text from the data. Card text is a pure function of the
// data, so every window writes the same text and they agree.
//
// To be safe even if two windows ever disagree on that text (for example, a
// teammate running older code), a window repairs a card at most once per
// version of its container, so two windows cannot keep rewriting each other.
// Known limit: in that case each window still writes the card's text once
// per change to the container (every frame of a drag, say), stopping when
// the changes stop.

import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { validateComponent } from '../catalog/validate.ts'
import { rewriteCardText } from './applyComponentChange.ts'
import { readCardPart, type CardPart } from './cardParts.ts'

/** Container id -> the container version this window last repaired. */
export type RepairedVersions = Map<string, string>

const versionKey = (element: OrderedExcalidrawElement) =>
  `${String(element.version)}:${String(element.versionNonce)}`

/**
 * The card text elements to rewrite so each card shows its data. Records the
 * container versions it repairs in `repaired`. Old cards (no parts), plain
 * shapes and cards that already match give nothing.
 */
export function planCardTextRepairs(
  elements: readonly OrderedExcalidrawElement[],
  repaired: RepairedVersions,
): OrderedExcalidrawElement[] {
  // One pass to find each card group's parts, so the check stays linear.
  const partsByGroup = new Map<
    string,
    Partial<Record<CardPart, OrderedExcalidrawElement>>
  >()
  for (const element of elements) {
    const part = readCardPart(element)
    const group = element.groupIds.at(0)
    if (part === null || element.isDeleted || group === undefined) {
      continue
    }
    const parts = partsByGroup.get(group) ?? {}
    parts[part] ??= element
    partsByGroup.set(group, parts)
  }

  // A card group holds exactly one component; skip any group that does not,
  // since its text could belong to either.
  const components = new Map<
    string,
    { container: OrderedExcalidrawElement; data: ComponentData }[]
  >()
  for (const container of elements) {
    const group = container.groupIds.at(0)
    if (
      group === undefined ||
      !partsByGroup.has(group) ||
      container.isDeleted ||
      readCardPart(container) !== null
    ) {
      continue
    }
    const result = validateComponent(container.customData)
    if (result.ok) {
      components.set(group, [
        ...(components.get(group) ?? []),
        { container, data: result.data },
      ])
    }
  }

  const changed: OrderedExcalidrawElement[] = []
  for (const [group, found] of components) {
    const parts = partsByGroup.get(group)
    if (found.length !== 1 || !parts) {
      continue
    }
    const [{ container, data }] = found
    const rewrites = rewriteCardText(parts, data)
    const key = versionKey(container)
    if (rewrites.length > 0 && repaired.get(container.id) !== key) {
      repaired.set(container.id, key)
      changed.push(...rewrites)
    }
  }
  return changed
}
