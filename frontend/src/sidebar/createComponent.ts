import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog'
import { validateComponent } from '../catalog/validate'
import { iconFileId } from '../cards/cardIcons'
import {
  ADAPTIVE_RADIUS_ROUNDNESS,
  CARD,
  CARD_COLORS,
  DETAIL_WIDTH,
  NAME_WIDTH,
  cardTexts,
} from '../cards/cardLook'
import { cardPartData, readCardPart } from '../cards/cardParts'
import type { CatalogEntry } from './catalog'

/** Scene point (same units Excalidraw elements use). */
export interface ScenePoint {
  x: number
  y: number
}

/** Names already used by components on the board, for `nextComponentName`. */
export function collectComponentNames(
  elements: readonly { customData?: unknown }[],
): Set<string> {
  const names = new Set<string>()
  for (const element of elements) {
    const result = validateComponent(element.customData)
    if (result.ok) {
      names.add(result.data.name)
    }
  }
  return names
}

/**
 * Picks a name for a new component: the catalog label, or that label with
 * the lowest free number appended ("Database", "Database 2", ...).
 */
export function nextComponentName(
  label: string,
  existingNames: ReadonlySet<string>,
): string {
  if (!existingNames.has(label)) {
    return label
  }
  let suffix = 2
  while (existingNames.has(`${label} ${suffix.toString()}`)) {
    suffix += 1
  }
  return `${label} ${suffix.toString()}`
}

/** A random id for a new card's group. Works on plain http, unlike randomUUID. */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

/**
 * Builds the Excalidraw element skeletons for a new component card of
 * `entry`'s kind, centered on `center`, named after existing board
 * components. The card is one group: the container holding the component's
 * customData (arrows bind to it), then its locked icon, name and detail line.
 * Pass the result to `convertToExcalidrawElements` and then to
 * `finishComponentElements` to get real scene elements.
 */
export function createComponentSkeletons(
  entry: CatalogEntry,
  center: ScenePoint,
  existingNames: ReadonlySet<string>,
  groupId: string = newGroupId(),
): ExcalidrawElementSkeleton[] {
  const data = {
    v: 1,
    kind: entry.kind,
    name: nextComponentName(entry.label, existingNames),
    props: { ...entry.defaultProps },
  }
  const x = center.x - CARD.width / 2
  const y = center.y - CARD.height / 2
  const groupIds = [groupId]
  // The catalog's defaults are valid (validate.test.ts checks every kind), so
  // the card text can be built from the data as typed component data.
  const texts = cardTexts(data as ComponentData)
  const decoration = { groupIds, locked: true }

  return [
    {
      type: 'rectangle',
      x,
      y,
      width: CARD.width,
      height: CARD.height,
      backgroundColor: CARD_COLORS.fill,
      strokeColor: CARD_COLORS.border,
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: ADAPTIVE_RADIUS_ROUNDNESS, value: CARD.radius },
      groupIds,
      customData: data,
    },
    {
      type: 'image',
      x: x + CARD.icon.x,
      y: y + CARD.icon.y,
      width: CARD.icon.size,
      height: CARD.icon.size,
      fileId: iconFileId(entry.kind),
      status: 'saved',
      ...decoration,
      customData: cardPartData('icon'),
    },
    {
      type: 'text',
      x: x + CARD.name.x,
      y: y + CARD.name.y,
      text: texts.name,
      fontFamily: CARD.name.fontFamily,
      fontSize: CARD.name.fontSize,
      strokeColor: CARD_COLORS.name,
      textAlign: 'left',
      verticalAlign: 'top',
      ...decoration,
      customData: cardPartData('name'),
    },
    {
      type: 'text',
      x: x + CARD.detail.x,
      y: y + CARD.detail.y,
      text: texts.detail,
      fontFamily: CARD.detail.fontFamily,
      fontSize: CARD.detail.fontSize,
      strokeColor: CARD_COLORS.detail,
      textAlign: 'left',
      verticalAlign: 'top',
      ...decoration,
      customData: cardPartData('detail'),
    },
  ]
}

/**
 * Gives a new card's text lines their fixed layout width. Excalidraw measures
 * text when it converts a skeleton, and that measurement depends on whether
 * the font has loaded yet; it also sizes the canvas each text is drawn into.
 * A fixed width is the same in every window and always holds the fitted text.
 */
export function finishComponentElements<T extends ExcalidrawElement>(
  elements: readonly T[],
): T[] {
  return elements.map((element) => {
    const part = readCardPart(element)
    if (part === 'name') {
      return { ...element, width: NAME_WIDTH }
    }
    if (part === 'detail') {
      return { ...element, width: DETAIL_WIDTH }
    }
    return element
  })
}
