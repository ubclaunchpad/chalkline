// Pure logic behind the inspector: what the selection is, and how settings
// for connections, groups, colour and size turn into new element versions.
// Shapes follow docs/prototype/CONVENTIONS.md.

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { newElementWith } from '@excalidraw/excalidraw'
import type { ComponentData } from '../catalog/catalog.ts'
import { canvasColor } from '../design/canvasColor'
import type { ConnectionKind } from '../graph/deriveGraph.ts'
import { readComponent, type UpdateResult } from './updateComponent.ts'

export const MAX_LABEL_LENGTH = 60
export const MAX_GROUP_NAME_LENGTH = 100

export const CONNECTION_KINDS: readonly {
  value: ConnectionKind
  label: string
}[] = [
  { value: 'call', label: 'Call' },
  { value: 'async', label: 'Async' },
  { value: 'two-way', label: 'Two-way' },
]

export const PROTOCOLS = [
  'HTTP',
  'gRPC',
  'WebSocket',
  'SQL',
  'TCP',
  'Kafka',
  'AMQP',
  'Other',
] as const

export type GroupKind = 'vpc' | 'cluster' | 'region' | 'zone' | 'boundary'

export const GROUP_KINDS: readonly { value: GroupKind; label: string }[] = [
  { value: 'vpc', label: 'VPC' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'region', label: 'Region' },
  { value: 'zone', label: 'Zone' },
  { value: 'boundary', label: 'Boundary' },
]

// Teammate pastels from the design direction.
export const ACCENT_COLOURS: readonly { name: string; value: string }[] = [
  { name: 'Blue', value: '#81a6ee' },
  { name: 'Teal', value: '#66d9e8' },
  { name: 'Amber', value: '#ffc078' },
  { name: 'Pink', value: '#faa2c1' },
  { name: 'Violet', value: '#b197fc' },
]

export const SIZES = [
  { short: 'S', name: 'Small', width: 160, height: 80 },
  { short: 'M', name: 'Medium', width: 200, height: 100 },
  { short: 'L', name: 'Large', width: 240, height: 120 },
] as const

export type Size = (typeof SIZES)[number]

export interface ConnectionData {
  v: 1
  annotation: 'connection'
  kind: ConnectionKind
  label?: string
  props?: Record<string, string | number | boolean>
}

export interface GroupData {
  v: 1
  annotation: 'group'
  kind: GroupKind
  name: string
}

export type InspectTarget =
  | { type: 'component'; element: ExcalidrawElement; data: ComponentData }
  | { type: 'connection'; element: ExcalidrawElement; data: ConnectionData }
  | { type: 'group'; element: ExcalidrawElement; data: GroupData }
  | { type: 'many'; ids: string[]; summary: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isConnectionKind(value: unknown): value is ConnectionKind {
  return CONNECTION_KINDS.some((kind) => kind.value === value)
}

function isGroupKind(value: unknown): value is GroupKind {
  return GROUP_KINDS.some((kind) => kind.value === value)
}

/**
 * Connection data for an arrow: its own customData when it is a connection,
 * or a plain call when it is an unannotated arrow bound to two components.
 */
export function readConnection(
  element: ExcalidrawElement,
  elements: readonly ExcalidrawElement[],
): ConnectionData | null {
  if (element.type !== 'arrow') return null
  const data = asRecord(element.customData)
  if (data?.annotation === 'connection') {
    const connection: ConnectionData = {
      v: 1,
      annotation: 'connection',
      kind: isConnectionKind(data.kind) ? data.kind : 'call',
    }
    if (typeof data.label === 'string' && data.label !== '') {
      connection.label = data.label
    }
    const props = asRecord(data.props)
    if (props) connection.props = props as ConnectionData['props']
    return connection
  }
  if (data && 'annotation' in data) return null

  const isComponent = (id: string | undefined) => {
    const end = elements.find((el) => el.id === id && !el.isDeleted)
    return end !== undefined && readComponent(end) !== null
  }
  return isComponent(element.startBinding?.elementId) &&
    isComponent(element.endBinding?.elementId)
    ? { v: 1, annotation: 'connection', kind: 'call' }
    : null
}

export function readGroup(element: ExcalidrawElement): GroupData | null {
  const data = asRecord(element.customData)
  if (element.type !== 'rectangle' || data?.annotation !== 'group') return null
  return {
    v: 1,
    annotation: 'group',
    kind: isGroupKind(data.kind) ? data.kind : 'vpc',
    name: typeof data.name === 'string' ? data.name : '',
  }
}

const plural = (count: number, word: string) =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`

/** What the inspector should show for the current selection. */
export function inspectTarget(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
): InspectTarget | null {
  const selected = elements.filter(
    (el) => selectedIds.includes(el.id) && !el.isDeleted,
  )
  if (selected.length === 0) return null

  if (selected.length === 1) {
    const element = selected[0]
    const component = readComponent(element)
    if (component) return { type: 'component', element, data: component }
    const connection = readConnection(element, elements)
    if (connection) return { type: 'connection', element, data: connection }
    const group = readGroup(element)
    if (group) return { type: 'group', element, data: group }
    return null
  }

  let components = 0
  let connections = 0
  let groups = 0
  let others = 0
  for (const element of selected) {
    // A label inside a selected card is part of that card, not its own item.
    if (
      element.type === 'text' &&
      element.containerId !== null &&
      selectedIds.includes(element.containerId)
    ) {
      continue
    }
    if (readComponent(element)) components += 1
    else if (readConnection(element, elements)) connections += 1
    else if (readGroup(element)) groups += 1
    else others += 1
  }
  const parts = [
    components && plural(components, 'component'),
    connections && plural(connections, 'connection'),
    groups && plural(groups, 'group'),
    others && plural(others, 'other shape'),
  ].filter((part): part is string => typeof part === 'string')
  return {
    type: 'many',
    ids: selected.map((el) => el.id),
    summary: parts.join(', '),
  }
}

export interface ConnectionChange {
  kind?: string
  label?: string
  /** '' removes the protocol. */
  protocol?: string
}

/** Applies a connection change, creating the customData if it is missing. */
export function updateConnection(
  element: ExcalidrawElement,
  current: ConnectionData,
  change: ConnectionChange,
): UpdateResult {
  const problems: string[] = []
  const kind = change.kind ?? current.kind
  if (!isConnectionKind(kind)) {
    problems.push('kind must be Call, Async or Two-way')
  }
  const label = (change.label ?? current.label ?? '').trim()
  if (label.length > MAX_LABEL_LENGTH) {
    problems.push(
      `label must be at most ${String(MAX_LABEL_LENGTH)} characters`,
    )
  }
  const props = { ...current.props }
  if (change.protocol !== undefined) {
    if (change.protocol === '') {
      delete props.protocol
    } else if ((PROTOCOLS as readonly string[]).includes(change.protocol)) {
      props.protocol = change.protocol
    } else {
      problems.push(`protocol must be one of: ${PROTOCOLS.join(', ')}`)
    }
  }
  if (problems.length > 0 || !isConnectionKind(kind)) {
    return { ok: false, problems }
  }

  const next: ConnectionData = { v: 1, annotation: 'connection', kind }
  if (label !== '') next.label = label
  if (Object.keys(props).length > 0) next.props = props

  const before = asRecord(element.customData) ?? {}
  if (
    before.annotation === 'connection' &&
    JSON.stringify(next) === JSON.stringify(current)
  ) {
    return { ok: true, element }
  }
  const others = { ...before }
  delete others.label
  delete others.props
  return {
    ok: true,
    element: newElementWith(element, { customData: { ...others, ...next } }),
  }
}

export interface GroupChange {
  kind?: string
  name?: string
}

export function updateGroup(
  element: ExcalidrawElement,
  change: GroupChange,
): UpdateResult {
  const current = readGroup(element)
  if (!current) return { ok: false, problems: ['element is not a group'] }
  const kind = change.kind ?? current.kind
  const name = change.name ?? current.name
  const problems: string[] = []
  if (!isGroupKind(kind)) {
    problems.push(
      `kind must be one of: ${GROUP_KINDS.map((k) => k.label).join(', ')}`,
    )
  }
  if (name.trim() === '') problems.push('name is required')
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    problems.push(
      `name must be at most ${String(MAX_GROUP_NAME_LENGTH)} characters`,
    )
  }
  if (problems.length > 0 || !isGroupKind(kind)) return { ok: false, problems }
  if (kind === current.kind && name === current.name) {
    return { ok: true, element }
  }
  return {
    ok: true,
    element: newElementWith(element, {
      customData: { ...element.customData, kind, name },
    }),
  }
}

export function setAccent(
  element: ExcalidrawElement,
  colour: string,
): ExcalidrawElement {
  // The dark theme inverts canvas colours; store what shows as `colour`.
  const stored = canvasColor(colour)
  return element.strokeColor === stored
    ? element
    : newElementWith(element, { strokeColor: stored })
}

/** The size preset an element currently matches, if any. */
export function currentSize(element: ExcalidrawElement): Size | undefined {
  return SIZES.find(
    (size) => size.width === element.width && size.height === element.height,
  )
}

// Plain pairs: Excalidraw's branded point type does not resolve for lint.
type Point = [number, number]

// Where an aligned child sits along one axis: start, middle or end.
function anchorShift(
  align: string,
  oldStart: number,
  oldLength: number,
  newStart: number,
  newLength: number,
): number {
  if (align === 'left' || align === 'top') return newStart - oldStart
  if (align === 'right' || align === 'bottom') {
    return newStart + newLength - (oldStart + oldLength)
  }
  return newStart + newLength / 2 - (oldStart + oldLength / 2)
}

/**
 * Resizes a card around its centre. Returns the changed elements: the card,
 * its bound text moved to keep its alignment, and bound arrows whose ends are
 * moved with the card's edges so they stay attached.
 */
export function resizeAroundCentre(
  card: ExcalidrawElement,
  size: { width: number; height: number },
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  if (card.width === size.width && card.height === size.height) return []
  const cx = card.x + card.width / 2
  const cy = card.y + card.height / 2
  const x = cx - size.width / 2
  const y = cy - size.height / 2
  const sx = size.width / card.width
  const sy = size.height / card.height
  const changed: ExcalidrawElement[] = [
    newElementWith(card, { x, y, width: size.width, height: size.height }),
  ]

  // Moves an arrow end the same way the card's edge moves.
  const endShift = (px: number, py: number) => ({
    dx: cx + (px - cx) * sx - px,
    dy: cy + (py - cy) * sy - py,
  })

  for (const el of elements) {
    if (el.isDeleted) continue
    if (el.type === 'text' && el.containerId === card.id) {
      changed.push(
        newElementWith(el, {
          x:
            el.x + anchorShift(el.textAlign, card.x, card.width, x, size.width),
          y:
            el.y +
            anchorShift(el.verticalAlign, card.y, card.height, y, size.height),
        }),
      )
    } else if (el.type === 'arrow' && el.points.length >= 2) {
      const startBound = el.startBinding?.elementId === card.id
      const endBound = el.endBinding?.elementId === card.id
      if (!startBound && !endBound) continue
      // shortcut: ignores card rotation and elbow-arrow routing; Excalidraw
      // re-routes them on the next drag. Upgrade if rotated cards matter.
      let originX = el.x
      let originY = el.y
      const original = el.points as unknown as readonly Point[]
      let points: Point[] = original.map((p): Point => [p[0], p[1]])
      if (startBound) {
        const { dx, dy } = endShift(el.x + points[0][0], el.y + points[0][1])
        originX += dx
        originY += dy
        points = points.map((p, i) => (i === 0 ? p : [p[0] - dx, p[1] - dy]))
      }
      if (endBound) {
        const last = points.length - 1
        const { dx, dy } = endShift(
          originX + points[last][0],
          originY + points[last][1],
        )
        points[last] = [points[last][0] + dx, points[last][1] + dy]
      }
      const xs = points.map((p) => p[0])
      const ys = points.map((p) => p[1])
      changed.push(
        newElementWith(el, {
          x: originX,
          y: originY,
          points,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        }),
      )
    }
  }
  return changed
}

/** Marks the given elements and their bound labels deleted. */
export function deleteElements(
  ids: readonly string[],
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  return elements
    .filter(
      (el) =>
        !el.isDeleted &&
        (ids.includes(el.id) ||
          (el.type === 'text' &&
            el.containerId !== null &&
            ids.includes(el.containerId))),
    )
    .map((el) => newElementWith(el, { isDeleted: true }))
}
