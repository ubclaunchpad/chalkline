import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  defaultProps,
  isComponentData,
  KIND_DEFS,
  type ComponentData,
  type Kind,
} from './catalog'

export const COMPONENT_WIDTH = 180
export const COMPONENT_HEIGHT = 80

export function randomId(length = 10): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < length; i++)
    id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function labelFor(data: ComponentData): string {
  return `${data.name}\n${KIND_DEFS[data.kind].label.toLowerCase()}`
}

/** Skeleton for a typed component: a colored rectangle with a bound label. */
export function componentSkeleton(
  data: ComponentData,
  box: { id: string; x: number; y: number; width?: number; height?: number },
) {
  const def = KIND_DEFS[data.kind]
  return {
    type: 'rectangle' as const,
    id: box.id,
    x: box.x,
    y: box.y,
    width: box.width ?? COMPONENT_WIDTH,
    height: box.height ?? COMPONENT_HEIGHT,
    backgroundColor: def.background,
    strokeColor: def.stroke,
    fillStyle: 'solid' as const,
    strokeWidth: 2,
    roughness: 1,
    roundness: { type: 3 as const },
    customData: data,
    label: {
      text: labelFor(data),
      fontSize: 16,
      // Helvetica: a system font measures correctly before web fonts load.
      fontFamily: 2,
      strokeColor: '#1e1e1e',
    },
  }
}

export function nextName(
  kind: Kind,
  elements: readonly ExcalidrawElement[],
): string {
  const base = KIND_DEFS[kind].label
  const taken = new Set(
    elements
      .filter((e) => !e.isDeleted && isComponentData(e.customData))
      .map((e) => (e.customData as ComponentData).name),
  )
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** New component elements (container + label) centered on a scene point. */
export function createComponent(
  kind: Kind,
  center: { x: number; y: number },
  elements: readonly ExcalidrawElement[],
  avoidOverlap = false,
) {
  const data: ComponentData = {
    v: 1,
    kind,
    name: nextName(kind, elements),
    props: defaultProps(kind),
  }
  const id = randomId()
  const x = center.x - COMPONENT_WIDTH / 2
  let y = center.y - COMPONENT_HEIGHT / 2
  if (avoidOverlap) {
    // Step down until the new box doesn't cover an existing component.
    const boxes = elements.filter(
      (e) => !e.isDeleted && isComponentData(e.customData),
    )
    const overlaps = () =>
      boxes.some(
        (b) =>
          x < b.x + b.width &&
          x + COMPONENT_WIDTH > b.x &&
          y < b.y + b.height &&
          y + COMPONENT_HEIGHT > b.y,
      )
    for (let i = 0; i < 50 && overlaps(); i++) y += COMPONENT_HEIGHT + 30
  }
  const created = convertToExcalidrawElements(
    [componentSkeleton(data, { id, x, y })],
    { regenerateIds: false },
  )
  return { id, created }
}

/**
 * Replace a component's semantic data. The label is regenerated so the name
 * shows on the canvas; position, size, and arrow bindings are kept.
 */
export function updateComponent(
  elements: readonly ExcalidrawElement[],
  id: string,
  data: ComponentData,
): ExcalidrawElement[] {
  const container = elements.find((e) => e.id === id)
  if (!container) return [...elements]
  const oldText = elements.find(
    (e) => e.type === 'text' && e.containerId === id && !e.isDeleted,
  )

  const [fresh, freshText] = convertToExcalidrawElements(
    [
      componentSkeleton(data, {
        id,
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
      }),
    ],
    { regenerateIds: false },
  )
  const arrowBindings = (container.boundElements ?? []).filter(
    (b) => b.type !== 'text',
  )
  const newContainer = {
    ...fresh,
    angle: container.angle,
    index: container.index,
    version: container.version + 1,
    boundElements: [...arrowBindings, ...(fresh.boundElements ?? [])],
  } as ExcalidrawElement
  const newText = {
    ...freshText,
    index: oldText?.index ?? freshText.index,
  } as ExcalidrawElement

  const result: ExcalidrawElement[] = []
  for (const e of elements) {
    if (e.id === id) result.push(newContainer)
    else if (oldText && e.id === oldText.id) result.push(newText)
    else result.push(e)
  }
  if (!oldText) result.push(newText)
  return result
}
