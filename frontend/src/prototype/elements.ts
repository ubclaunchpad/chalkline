import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  defaultProps,
  isComponentData,
  KIND_DEFS,
  type ComponentData,
  type Kind,
} from './catalog'
import { iconFileId } from './icons'

export const COMPONENT_WIDTH = 180
export const COMPONENT_HEIGHT = 100
const ICON_SIZE = 32
const ICON_TOP = 12

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

const iconId = (componentId: string) => `${componentId}-icon`
const groupId = (componentId: string) => `${componentId}-group`

/** The icon image's customData points back at its component. */
export function iconOwner(element: ExcalidrawElement): string | undefined {
  const owner: unknown = element.customData?.iconFor
  return element.type === 'image' && typeof owner === 'string'
    ? owner
    : undefined
}

/** The component an element belongs to: its box, label, or icon. */
export function componentIdOf(
  element: ExcalidrawElement,
  byId: Map<string, ExcalidrawElement>,
): string | undefined {
  if (isComponentData(element.customData)) return element.id
  const owner =
    iconOwner(element) ?? (element.type === 'text' ? element.containerId : null)
  return owner && isComponentData(byId.get(owner)?.customData)
    ? owner
    : undefined
}

function iconPosition(box: { x: number; y: number; width: number }) {
  return { x: box.x + box.width / 2 - ICON_SIZE / 2, y: box.y + ICON_TOP }
}

/**
 * Skeletons for a typed component: a colored box with a bound label, plus its
 * icon. All three share a group so they move and select together.
 */
export function componentSkeletons(
  data: ComponentData,
  box: { id: string; x: number; y: number; width?: number; height?: number },
) {
  const def = KIND_DEFS[data.kind]
  const width = box.width ?? COMPONENT_WIDTH
  const height = box.height ?? COMPONENT_HEIGHT
  const groupIds = [groupId(box.id)]
  return [
    {
      type: 'rectangle' as const,
      id: box.id,
      x: box.x,
      y: box.y,
      width,
      height,
      groupIds,
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
        fontFamily: 2 as const,
        verticalAlign: 'bottom' as const,
        strokeColor: '#1e1e1e',
        groupIds,
      },
    },
    {
      type: 'image' as const,
      id: iconId(box.id),
      ...iconPosition({ x: box.x, y: box.y, width }),
      width: ICON_SIZE,
      height: ICON_SIZE,
      fileId: iconFileId(data.kind),
      status: 'saved' as const,
      groupIds,
      customData: { iconFor: box.id },
    },
  ]
}

/** Give bound labels their component's group (the label skeleton may not). */
export function groupLabels(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  return elements.map((e) => {
    if (e.type !== 'text' || !e.containerId) return e
    const container = byId.get(e.containerId)
    if (!container || !isComponentData(container.customData)) return e
    return { ...e, groupIds: container.groupIds }
  })
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

/** New component elements (box, label, icon) centered on a scene point. */
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
  const created = groupLabels(
    convertToExcalidrawElements(componentSkeletons(data, { id, x, y }), {
      regenerateIds: false,
    }),
  )
  return { id, created }
}

/**
 * Replace a component's semantic data. The label and icon are regenerated so
 * the name and kind show on the canvas; position, size, grouping, and arrow
 * bindings are kept.
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
  const oldIcon = elements.find((e) => !e.isDeleted && iconOwner(e) === id)

  const [fresh, freshText, freshIcon] = convertToExcalidrawElements(
    componentSkeletons(data, {
      id,
      x: container.x,
      y: container.y,
      width: container.width,
      height: container.height,
    }),
    { regenerateIds: false },
  )
  // Boards made before icons existed have no group yet.
  const groupIds = container.groupIds.length
    ? container.groupIds
    : fresh.groupIds
  const arrowBindings = (container.boundElements ?? []).filter(
    (b) => b.type !== 'text',
  )
  const newContainer = {
    ...fresh,
    angle: container.angle,
    index: container.index,
    groupIds,
    version: container.version + 1,
    boundElements: [...arrowBindings, ...(fresh.boundElements ?? [])],
  } as ExcalidrawElement
  const newText = {
    ...freshText,
    groupIds,
    index: oldText?.index ?? freshText.index,
  } as ExcalidrawElement
  const newIcon = {
    ...freshIcon,
    groupIds,
    index: oldIcon?.index ?? freshIcon.index,
    // Keep any arrows the user happened to bind to the icon.
    boundElements: oldIcon?.boundElements ?? null,
  } as ExcalidrawElement

  const result: ExcalidrawElement[] = []
  for (const e of elements) {
    if (e.id === id) result.push(newContainer)
    else if (oldText && e.id === oldText.id) result.push(newText)
    else if (oldIcon && e.id === oldIcon.id) result.push(newIcon)
    else result.push(e)
  }
  if (!oldText) result.push(newText)
  if (!oldIcon) result.push(newIcon)
  return result
}

/** Add icons to components saved before icons existed. */
export function addMissingIcons(
  elements: ExcalidrawElement[],
): ExcalidrawElement[] {
  const withIcon = new Set(elements.map(iconOwner).filter(Boolean))
  let result = elements
  for (const e of elements) {
    if (!e.isDeleted && isComponentData(e.customData) && !withIcon.has(e.id)) {
      // Older boxes were shorter; make room for the icon above the label.
      const taller = { ...e, height: Math.max(e.height, COMPONENT_HEIGHT) }
      result = result.map((x) => (x.id === e.id ? taller : x))
      result = updateComponent(result, e.id, e.customData)
    }
  }
  return result
}
