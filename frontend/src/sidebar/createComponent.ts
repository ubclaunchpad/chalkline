import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { ComponentData } from '../catalog/catalog'
import { validateComponent } from '../catalog/validate'
import { canvasColor } from '../design/canvasColor'
import { cardLabel } from '../elements/describe'
import { CARD, CARD_LABEL, ROUNDED } from '../elements/look'
import { COMPONENT_HEIGHT, COMPONENT_WIDTH, type CatalogEntry } from './catalog'

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

/**
 * Builds the Excalidraw element skeleton for a new component of `entry`'s
 * kind, centered on `center`, named after existing board components. Pass
 * the result to `convertToExcalidrawElements` to get real scene elements.
 */
export function createComponentSkeleton(
  entry: CatalogEntry,
  center: ScenePoint,
  existingNames: ReadonlySet<string>,
): ExcalidrawElementSkeleton {
  const data = {
    v: 1,
    kind: entry.kind,
    name: nextComponentName(entry.label, existingNames),
    props: { ...entry.defaultProps },
  } as ComponentData

  // A dark card outlined in the kind's colour; ElementEffects adds the icon.
  return {
    type: 'rectangle',
    x: center.x - COMPONENT_WIDTH / 2,
    y: center.y - COMPONENT_HEIGHT / 2,
    width: COMPONENT_WIDTH,
    height: COMPONENT_HEIGHT,
    backgroundColor: CARD.fill,
    strokeColor: canvasColor(entry.color),
    strokeWidth: 1,
    fillStyle: 'solid',
    roughness: 0,
    roundness: ROUNDED,
    label: { text: cardLabel(data), ...CARD_LABEL },
    customData: data,
  }
}
