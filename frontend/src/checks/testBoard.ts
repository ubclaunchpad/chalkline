// Test-only builders for small boards, shared by the checks, flow and review tests.
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  CATALOG,
  type ComponentKind,
  type KindDefinition,
} from '../catalog/catalog.ts'
import type { ConnectionKind } from '../graph/deriveGraph.ts'

const base = (id: string) => ({
  id,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roundness: null,
  roughness: 1,
  opacity: 100,
  seed: 1,
  version: 1,
  versionNonce: 1,
  index: null,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
})

export function component(
  id: string,
  kind: ComponentKind,
  name: string,
  props: Record<string, unknown> = {},
): ExcalidrawElement {
  const settings: KindDefinition['settings'] = CATALOG[kind].settings
  const defaults = Object.fromEntries(
    Object.entries(settings).map(([key, setting]) => [key, setting.default]),
  )
  return {
    ...base(id),
    type: 'rectangle',
    customData: { v: 1, kind, name, props: { ...defaults, ...props } },
  } as ExcalidrawElement
}

export function arrow(
  id: string,
  from: string | null,
  to: string | null,
  connection: {
    kind?: ConnectionKind
    label?: string
    props?: Record<string, string | number | boolean>
  } = {},
): ExcalidrawElement {
  const binding = (elementId: string | null) =>
    elementId === null ? null : { elementId, focus: 0, gap: 1 }
  return {
    ...base(id),
    type: 'arrow',
    points: [
      [0, 0],
      [100, 0],
    ],
    lastCommittedPoint: null,
    startBinding: binding(from),
    endBinding: binding(to),
    startArrowhead: null,
    endArrowhead: 'arrow',
    elbowed: false,
    customData: {
      v: 1,
      annotation: 'connection',
      kind: connection.kind ?? 'call',
      ...(connection.label !== undefined && { label: connection.label }),
      ...(connection.props !== undefined && { props: connection.props }),
    },
  } as unknown as ExcalidrawElement
}

/** client → gateway → service → database + cache, with nothing wrong. */
export function healthyBoard(): ExcalidrawElement[] {
  return [
    component('client', 'client', 'Web app'),
    component('gateway', 'api_gateway', 'API gateway'),
    component('service', 'service', 'Orders service', { instances: 3 }),
    component('db', 'database', 'Orders DB', { replicas: 2 }),
    component('cache', 'cache', 'Redis'),
    component('metrics', 'monitoring', 'Metrics'),
    arrow('a1', 'client', 'gateway'),
    arrow('a2', 'gateway', 'service'),
    arrow('a3', 'service', 'db'),
    arrow('a4', 'service', 'cache'),
    arrow('a5', 'metrics', 'service'),
  ]
}
