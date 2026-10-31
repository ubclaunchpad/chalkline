import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import {
  COMPONENT_HEIGHT,
  COMPONENT_WIDTH,
  isComponentData,
  type CatalogEntry,
} from './catalog'

// Mirrors `ROUNDNESS.ADAPTIVE_RADIUS` from '@excalidraw/excalidraw'. Inlined
// as a literal so this pure, unit-tested logic doesn't have to import
// Excalidraw's full runtime bundle (which assumes a browser) just to read
// one constant; `addComponent.ts` imports the real runtime separately.
const ADAPTIVE_RADIUS_ROUNDNESS = 3 as const

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
    if (isComponentData(element.customData)) {
      names.add(element.customData.name)
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
  const name = nextComponentName(entry.label, existingNames)

  return {
    type: 'rectangle',
    x: center.x - COMPONENT_WIDTH / 2,
    y: center.y - COMPONENT_HEIGHT / 2,
    width: COMPONENT_WIDTH,
    height: COMPONENT_HEIGHT,
    backgroundColor: entry.color,
    roundness: { type: ADAPTIVE_RADIUS_ROUNDNESS },
    label: { text: `${name}\n${entry.kind}` },
    customData: {
      v: 1,
      kind: entry.kind,
      name,
      props: entry.defaultProps,
    },
  }
}
