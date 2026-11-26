export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface ToolbarLayout {
  bounds: Size
  toolbar: Size
}

export type Orientation = 'vertical' | 'horizontal'

export interface Placement extends Point {
  orientation: Orientation
}

/** Gap kept between the toolbar and the canvas edges. */
export const EDGE_MARGIN = 8
/** Default distance from the left edge of the canvas. */
export const DEFAULT_LEFT = 16
export const KEYBOARD_STEP = 16
export const KEYBOARD_LARGE_STEP = 64
/** Width and height of the single-tool chip shown while dragging. */
export const COLLAPSED_SIZE = 46

const clampAxis = (value: number, available: number, size: number): number => {
  const max = Math.max(EDGE_MARGIN, available - size - EDGE_MARGIN)
  return Math.min(Math.max(value, EDGE_MARGIN), max)
}

/** Keeps the toolbar inside the canvas, favouring the top-left if it can't fit. */
export const clampPosition = (
  position: Point,
  { bounds, toolbar }: ToolbarLayout,
): Point => ({
  x: clampAxis(position.x, bounds.width, toolbar.width),
  y: clampAxis(position.y, bounds.height, toolbar.height),
})

/** Vertically centred near the left edge of the canvas. */
export const defaultPosition = (layout: ToolbarLayout): Point =>
  clampPosition(
    {
      x: DEFAULT_LEFT,
      y: (layout.bounds.height - layout.toolbar.height) / 2,
    },
    layout,
  )

const ARROW_DIRECTIONS: Readonly<Record<string, Point>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

/** Returns the moved position for an arrow key, or null for any other key. */
export const nudgePosition = (
  position: Point,
  key: string,
  large: boolean,
  layout: ToolbarLayout,
): Point | null => {
  if (!Object.hasOwn(ARROW_DIRECTIONS, key)) return null

  const direction = ARROW_DIRECTIONS[key]
  const step = large ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP
  return clampPosition(
    {
      x: position.x + direction.x * step,
      y: position.y + direction.y * step,
    },
    layout,
  )
}

/**
 * Attaches the toolbar to the edge nearest the pointer, centred on the pointer
 * along that edge. Left and right are vertical; top and bottom are horizontal.
 */
export const dockPlacement = (
  pointer: Point,
  { bounds, toolbar }: ToolbarLayout,
  current: Orientation,
): Placement => {
  const toLeft = pointer.x
  const toRight = bounds.width - pointer.x
  const toTop = pointer.y
  const toBottom = bounds.height - pointer.y
  const orientation: Orientation =
    Math.min(toLeft, toRight) <= Math.min(toTop, toBottom)
      ? 'vertical'
      : 'horizontal'
  const size =
    orientation === current
      ? toolbar
      : { width: toolbar.height, height: toolbar.width }

  const docked =
    orientation === 'vertical'
      ? {
          x:
            toLeft <= toRight
              ? EDGE_MARGIN
              : bounds.width - size.width - EDGE_MARGIN,
          y: pointer.y - size.height / 2,
        }
      : {
          x: pointer.x - size.width / 2,
          y:
            toTop <= toBottom
              ? EDGE_MARGIN
              : bounds.height - size.height - EDGE_MARGIN,
        }
  return { ...clampPosition(docked, { bounds, toolbar: size }), orientation }
}

/**
 * Moves by arrow key. Pressing toward an edge the toolbar already touches docks
 * it there, pivoting to match that edge.
 */
export const nudgePlacement = (
  placement: Placement,
  key: string,
  large: boolean,
  layout: ToolbarLayout,
): Placement | null => {
  const next = nudgePosition(placement, key, large, layout)
  if (!next) return null
  if (next.x !== placement.x || next.y !== placement.y) {
    return { ...next, orientation: placement.orientation }
  }

  const direction = ARROW_DIRECTIONS[key]
  const orientation: Orientation = direction.x !== 0 ? 'vertical' : 'horizontal'
  if (orientation === placement.orientation) return placement

  const { bounds, toolbar } = layout
  const docked = clampPosition(
    {
      x: placement.x + direction.x * bounds.width,
      y: placement.y + direction.y * bounds.height,
    },
    { bounds, toolbar: { width: toolbar.height, height: toolbar.width } },
  )
  return { ...docked, orientation }
}

/** Lines that fit, so small canvases wrap controls instead of clipping them. */
export const linesThatFit = (
  availableLength: number,
  itemCount: number,
  itemSize: number,
  gap: number,
  padding: number,
): number => {
  const usable = availableLength - EDGE_MARGIN * 2 - padding * 2 + gap
  const lines = Math.floor(usable / (itemSize + gap))
  return Math.min(Math.max(lines, 1), itemCount)
}

export const parsePlacement = (stored: string | null): Placement | null => {
  if (stored === null) return null

  try {
    const value: unknown = JSON.parse(stored)
    if (typeof value !== 'object' || value === null) return null

    const { x, y, orientation } = value as Record<string, unknown>
    return typeof x === 'number' &&
      typeof y === 'number' &&
      Number.isFinite(x) &&
      Number.isFinite(y)
      ? {
          x,
          y,
          orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
        }
      : null
  } catch {
    return null
  }
}
