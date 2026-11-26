// How Chalkline's board elements look, and skeleton builders for them. Pure:
// pass the skeletons to convertToExcalidrawElements to get scene elements.
import type {
  ExcalidrawElementSkeleton,
  ValidLinearElement,
} from '@excalidraw/excalidraw/data/transform'
import type {
  Arrowhead,
  FontFamilyValues,
  StrokeStyle,
  TextAlign,
  VerticalAlign,
} from '@excalidraw/excalidraw/element/types'
import { canvasColor } from '../design/canvasColor'
import type { ConnectionKind } from '../graph/deriveGraph'

export type GroupKind = 'vpc' | 'cluster' | 'region' | 'zone' | 'boundary'

// Excalidraw's FONT_FAMILY ids. They are saved in board files, so they never
// change; copied here so this module loads in tests without Excalidraw.
export const FONT = { Cascadia: 3, Excalifont: 5, Nunito: 6 } as const

// Excalidraw's "adaptive radius" rounded corners.
export const ROUNDED = { type: 3 } as const

// Design tokens from src/index.css, converted for the dark canvas filter
// (see canvasColor), so what is stored differs from what people see.
export const INK = canvasColor('#f2f6fd')
export const MUTED = canvasColor('#a9b6cf')

export const CARD = {
  fill: canvasColor('#283349'),
  iconSize: 24,
  iconTop: 14,
} as const

export const STICKY = {
  fill: canvasColor('#d8e3fa'),
  ink: canvasColor('#2d3a53'),
  width: 200,
  height: 160,
} as const

/** Room around grouped elements; extra on top for the label. */
export const GROUP_PADDING = 32
export const GROUP_LABEL_SPACE = 28

export interface LabelStyle {
  fontFamily: FontFamilyValues
  fontSize: number
  strokeColor: string
  textAlign: TextAlign
  verticalAlign: VerticalAlign
}

export const CARD_LABEL: LabelStyle = {
  fontFamily: FONT.Nunito,
  fontSize: 16,
  strokeColor: INK,
  textAlign: 'center',
  verticalAlign: 'bottom',
}

export const CONNECTION_LABEL: LabelStyle = {
  fontFamily: FONT.Cascadia,
  fontSize: 14,
  strokeColor: MUTED,
  textAlign: 'center',
  verticalAlign: 'middle',
}

export const GROUP_LABEL: LabelStyle = {
  fontFamily: FONT.Nunito,
  fontSize: 16,
  strokeColor: MUTED,
  textAlign: 'left',
  verticalAlign: 'top',
}

/** Arrow look shared by every connection; set once, so users can recolour. */
export const CONNECTION_BASE = {
  strokeColor: MUTED,
  strokeWidth: 1.75,
  roughness: 0,
} as const

export interface ConnectionStyle {
  strokeStyle: StrokeStyle
  startArrowhead: Arrowhead | null
  endArrowhead: Arrowhead | null
}

/** Solid for a call, dashed for async, heads on both ends for two-way. */
export function connectionStyle(kind: ConnectionKind): ConnectionStyle {
  return {
    strokeStyle: kind === 'async' ? 'dashed' : 'solid',
    startArrowhead: kind === 'two-way' ? 'arrow' : null,
    endArrowhead: 'arrow',
  }
}

const CONNECTION_KINDS: readonly string[] = ['call', 'async', 'two-way']

/** The connection kind stored on an arrow; anything unknown is a call. */
export function readConnectionKind(customData: unknown): ConnectionKind {
  const kind = (customData as { kind?: unknown } | undefined)?.kind
  return typeof kind === 'string' && CONNECTION_KINDS.includes(kind)
    ? (kind as ConnectionKind)
    : 'call'
}

/** An arrow skeleton bound to two elements in the same conversion. */
export function connectionSkeleton(
  from: string,
  to: string,
  kind: ConnectionKind = 'call',
  label?: string,
): ValidLinearElement {
  return {
    type: 'arrow',
    x: 0,
    y: 0,
    start: { id: from },
    end: { id: to },
    ...CONNECTION_BASE,
    ...connectionStyle(kind),
    ...(label ? { label: { text: label, ...CONNECTION_LABEL } } : {}),
    customData: {
      v: 1,
      annotation: 'connection',
      kind,
      ...(label ? { label } : {}),
    },
  }
}

/** A pale blue sticky note centred on a scene point. */
export function stickySkeleton(center: {
  x: number
  y: number
}): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    x: center.x - STICKY.width / 2,
    y: center.y - STICKY.height / 2,
    width: STICKY.width,
    height: STICKY.height,
    backgroundColor: STICKY.fill,
    strokeColor: STICKY.fill,
    fillStyle: 'solid',
    roughness: 0,
    roundness: ROUNDED,
    customData: { v: 1, annotation: 'sticky' },
  }
}

export const GROUP_NAMES: Readonly<Record<GroupKind, string>> = {
  vpc: 'VPC',
  cluster: 'Cluster',
  region: 'Region',
  zone: 'Zone',
  boundary: 'Boundary',
}

/** A dashed, unfilled, labelled box around the given bounds. */
export function groupSkeleton(
  [minX, minY, maxX, maxY]: readonly [number, number, number, number],
  kind: GroupKind,
  name: string = GROUP_NAMES[kind],
): ExcalidrawElementSkeleton {
  const top = GROUP_PADDING + GROUP_LABEL_SPACE
  return {
    type: 'rectangle',
    x: minX - GROUP_PADDING,
    y: minY - top,
    width: maxX - minX + GROUP_PADDING * 2,
    height: maxY - minY + GROUP_PADDING + top,
    strokeColor: MUTED,
    backgroundColor: 'transparent',
    strokeStyle: 'dashed',
    strokeWidth: 1.75,
    roughness: 0,
    roundness: ROUNDED,
    label: { text: name, ...GROUP_LABEL },
    customData: { v: 1, annotation: 'group', kind, name },
  }
}
