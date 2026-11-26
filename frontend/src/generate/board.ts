// Puts generated components and connections on the board, and re-lays-out
// the components already there ("Tidy up").
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
} from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ComponentKind } from '../catalog/catalog'
import { createConnectionSkeleton } from '../elements/actions'
import { deriveGraph, type ConnectionKind } from '../graph/deriveGraph'
import { catalog, COMPONENT_HEIGHT, COMPONENT_WIDTH } from '../sidebar/catalog'
import {
  collectComponentNames,
  createComponentSkeleton,
  type ScenePoint,
} from '../sidebar/createComponent'
import { layoutGraph } from './layout'
import { NEW, type Suggestion } from './suggest'

export interface DraftComponent {
  key: string
  kind: ComponentKind
  name: string
  props?: Record<string, unknown>
}

export interface DraftConnection {
  /** A draft key, or the id of an element already on the board. */
  from: string
  to: string
  kind: ConnectionKind
  label?: string
}

export interface Draft {
  components: DraftComponent[]
  connections: DraftConnection[]
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

// The hidden board-info element sits far off-canvas; ignore it.
const BOARD_INFO_X = -50000

// Space between an arrow tip and the card it points at.
const ARROW_GAP = 8

const centerOf = (box: Box): ScenePoint => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

function edgePoint(box: Box, toward: ScenePoint): ScenePoint {
  const c = centerOf(box)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return c
  const scale = Math.min(
    dx === 0 ? Infinity : box.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.height / 2 / Math.abs(dy),
  )
  return {
    x: c.x + dx * scale + (dx / length) * ARROW_GAP,
    y: c.y + dy * scale + (dy / length) * ARROW_GAP,
  }
}

/** A straight arrow from the edge of `a` to the edge of `b`. */
export function arrowBetween(a: Box, b: Box) {
  const start = edgePoint(a, centerOf(b))
  const end = edgePoint(b, centerOf(a))
  const dx = end.x - start.x
  const dy = end.y - start.y
  return {
    x: start.x,
    y: start.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [
      [0, 0],
      [dx, dy],
    ] as unknown as ExcalidrawArrowElement['points'],
  }
}

const binding = (elementId: string) => ({
  elementId,
  focus: 0,
  gap: ARROW_GAP,
})

/** The scene point in the middle of what the user can see. */
export function viewCenter(api: ExcalidrawImperativeAPI): ScenePoint {
  const appState = api.getAppState()
  return viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  )
}

/**
 * Adds components (centred on `center`) and bound arrows in one undo step.
 * Connections may point at existing element ids; `removeIds` deletes
 * existing arrows (and their labels) in the same step. Returns the new cards.
 */
export function addToBoard(
  api: ExcalidrawImperativeAPI,
  components: readonly (DraftComponent & { center: ScenePoint })[],
  connections: readonly DraftConnection[],
  removeIds: readonly string[] = [],
): ExcalidrawElement[] {
  const scene = api.getSceneElementsIncludingDeleted()
  const names = collectComponentNames(api.getSceneElements())
  const idOf = new Map<string, string>()

  const cards = convertToExcalidrawElements(
    components.map((component) => {
      const entry = catalog.find((e) => e.kind === component.kind)
      if (!entry) throw new Error(`Unknown component kind ${component.kind}`)
      const skeleton = createComponentSkeleton(
        {
          ...entry,
          label: component.name,
          defaultProps: { ...entry.defaultProps, ...component.props },
        },
        component.center,
        names,
      )
      names.add(String(skeleton.customData?.name))
      const id = crypto.randomUUID()
      idOf.set(component.key, id)
      return { ...skeleton, id }
    }),
    { regenerateIds: false },
  )

  const boxes = new Map<string, ExcalidrawElement>()
  for (const element of [...scene, ...cards]) {
    if (!element.isDeleted) boxes.set(element.id, element)
  }
  const links = new Map<string, { from: string; to: string }>()
  const arrowSkeletons = connections.flatMap((connection) => {
    const from = idOf.get(connection.from) ?? connection.from
    const to = idOf.get(connection.to) ?? connection.to
    const a = boxes.get(from)
    const b = boxes.get(to)
    if (!a || !b || from === to) return []
    // Bindings are set below, so the ends can also be existing elements.
    const id = crypto.randomUUID()
    links.set(id, { from, to })
    const arrow = {
      ...createConnectionSkeleton(from, to, connection.kind, connection.label),
      ...arrowBetween(a, b),
      start: undefined,
      end: undefined,
      id,
    }
    return [arrow]
  })
  const arrows = convertToExcalidrawElements(arrowSkeletons, {
    regenerateIds: false,
  }).map((element) => {
    const link = links.get(element.id)
    return link
      ? {
          ...element,
          startBinding: binding(link.from),
          endBinding: binding(link.to),
        }
      : element
  })

  const attached = new Map<string, { id: string; type: 'arrow' }[]>()
  for (const [id, { from, to }] of links) {
    for (const end of [from, to]) {
      attached.set(end, [...(attached.get(end) ?? []), { id, type: 'arrow' }])
    }
  }
  const withArrows = (element: ExcalidrawElement) => [
    ...(element.boundElements ?? []),
    ...(attached.get(element.id) ?? []),
  ]
  const removing = new Set(removeIds)

  api.updateScene({
    elements: [
      ...scene.map((element) => {
        if (
          removing.has(element.id) ||
          ('containerId' in element &&
            element.containerId !== null &&
            removing.has(element.containerId))
        ) {
          return newElementWith(element, { isDeleted: true })
        }
        return attached.has(element.id)
          ? newElementWith(element, { boundElements: withArrows(element) })
          : element
      }),
      ...cards.map((card) => ({ ...card, boundElements: withArrows(card) })),
      ...arrows,
    ],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
  return cards.filter((card) => card.type === 'rectangle')
}

/** Lays a draft out and adds it in the middle of the view. */
export function insertDraft(api: ExcalidrawImperativeAPI, draft: Draft): void {
  if (draft.components.length === 0) return
  const positions = layoutGraph(
    draft.components.map((c) => c.key),
    draft.connections.map((c) => ({ source: c.from, target: c.to })),
    { nodeWidth: COMPONENT_WIDTH, nodeHeight: COMPONENT_HEIGHT },
  )
  const points = [...positions.values()]
  const width = Math.max(...points.map((p) => p.x)) + COMPONENT_WIDTH / 2
  const height = Math.max(...points.map((p) => p.y)) + COMPONENT_HEIGHT / 2
  const middle = viewCenter(api)
  // Centre the layout in the view, or put it under the existing drawing
  // when that spot is taken.
  let dx = middle.x - width / 2
  let dy = middle.y - height / 2
  const taken = api
    .getSceneElements()
    .filter((e) => e.x > BOARD_INFO_X && e.type !== 'text')
  const covers = (e: ExcalidrawElement) =>
    e.x < dx + width &&
    e.x + e.width > dx &&
    e.y < dy + height &&
    e.y + e.height > dy
  if (taken.some(covers)) {
    dx = Math.min(...taken.map((e) => e.x))
    dy = Math.max(...taken.map((e) => e.y + e.height)) + COMPONENT_HEIGHT
  }
  const cards = addToBoard(
    api,
    draft.components.map((component) => {
      const at = positions.get(component.key) ?? { x: 0, y: 0 }
      return { ...component, center: { x: at.x + dx, y: at.y + dy } }
    }),
    draft.connections,
  )
  api.scrollToContent(cards, { fitToContent: true, animate: true })
}

/**
 * Re-lays-out every component on the board, moving their labels with them
 * and redrawing arrows between components as straight bound lines.
 * Returns false when there is nothing to tidy.
 */
export function tidyBoard(api: ExcalidrawImperativeAPI): boolean {
  const scene = api.getSceneElementsIncludingDeleted()
  const graph = deriveGraph(api.getSceneElements())
  const byId = new Map(scene.map((element) => [element.id, element]))
  const cards = Object.keys(graph.nodes).flatMap((id) => byId.get(id) ?? [])
  if (cards.length === 0) return false

  const positions = layoutGraph(
    cards.map((card) => card.id),
    Object.values(graph.edges),
    {
      nodeWidth: Math.max(...cards.map((card) => card.width)),
      nodeHeight: Math.max(...cards.map((card) => card.height)),
    },
  )
  // Keep the drawing where it was: anchor at the old top-left corner.
  const left = Math.min(...cards.map((card) => card.x))
  const top = Math.min(...cards.map((card) => card.y))
  const shift = new Map<string, ScenePoint>()
  for (const card of cards) {
    const at = positions.get(card.id) ?? centerOf(card)
    shift.set(card.id, {
      x: left + at.x - card.width / 2 - card.x,
      y: top + at.y - card.height / 2 - card.y,
    })
  }
  const moved = new Map<string, ExcalidrawElement>()
  for (const card of cards) {
    const d = shift.get(card.id) ?? { x: 0, y: 0 }
    moved.set(card.id, { ...card, x: card.x + d.x, y: card.y + d.y })
  }

  const arrows = new Map<string, ReturnType<typeof arrowBetween>>()
  for (const edge of Object.values(graph.edges)) {
    const a = moved.get(edge.source)
    const b = moved.get(edge.target)
    if (a && b) arrows.set(edge.id, arrowBetween(a, b))
  }

  const next = scene.map((element) => {
    if (element.isDeleted) return element
    const d = shift.get(element.id)
    if (d)
      return newElementWith(element, { x: element.x + d.x, y: element.y + d.y })
    const arrow = arrows.get(element.id)
    if (arrow && element.type === 'arrow') {
      return newElementWith(element, {
        ...arrow,
        startBinding: element.startBinding && {
          ...element.startBinding,
          focus: 0,
        },
        endBinding: element.endBinding && { ...element.endBinding, focus: 0 },
      })
    }
    if (element.type !== 'text' || element.containerId === null) return element
    const cardShift = shift.get(element.containerId)
    if (cardShift) {
      return newElementWith(element, {
        x: element.x + cardShift.x,
        y: element.y + cardShift.y,
      })
    }
    // A label on a redrawn arrow goes to the arrow's new midpoint.
    const line = arrows.get(element.containerId)
    if (!line) return element
    const [, [dx, dy]] = line.points as unknown as [number, number][]
    return newElementWith(element, {
      x: line.x + dx / 2 - element.width / 2,
      y: line.y + dy / 2 - element.height / 2,
    })
  })
  api.updateScene({
    elements: next,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
  api.scrollToContent(
    cards.map((card) => moved.get(card.id) ?? card),
    { fitToContent: true, animate: true },
  )
  return true
}

/** A spot beside `near` for a new card that doesn't cover anything. */
function freeSpotNear(
  near: Box,
  elements: readonly ExcalidrawElement[],
): ScenePoint {
  const c = centerOf(near)
  const stepX = COMPONENT_WIDTH + 120
  const stepY = COMPONENT_HEIGHT + 80
  const spots = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
    [1, -1],
    [1, 1],
    [-1, -1],
    [-1, 1],
    [0, -2],
    [0, 2],
    [2, 0],
  ].map(([x, y]) => ({ x: c.x + x * stepX, y: c.y + y * stepY }))
  const margin = 20
  const free = (p: ScenePoint) =>
    elements.every(
      (e) =>
        e.x > p.x + COMPONENT_WIDTH / 2 + margin ||
        e.x + e.width < p.x - COMPONENT_WIDTH / 2 - margin ||
        e.y > p.y + COMPONENT_HEIGHT / 2 + margin ||
        e.y + e.height < p.y - COMPONENT_HEIGHT / 2 - margin,
    )
  return spots.find(free) ?? spots[1]
}

/** Adds a suggested component next to `add.near` and connects it. */
export function applySuggestion(
  api: ExcalidrawImperativeAPI,
  add: NonNullable<Suggestion['add']>,
): void {
  const elements = api.getSceneElements()
  const near = elements.find((e) => e.id === add.near)
  if (!near) return
  // Arrows are thin and get redrawn, so only cards and notes block a spot.
  const blocking = elements.filter(
    (e) => e.type !== 'arrow' && e.type !== 'text',
  )
  addToBoard(
    api,
    [
      {
        key: NEW,
        kind: add.kind,
        name: add.name,
        center: freeSpotNear(near, blocking),
      },
    ],
    add.connections,
    add.remove,
  )
}
