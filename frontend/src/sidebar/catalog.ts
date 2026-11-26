// Sidebar-facing view over the shared component catalog (#30): adds what
// the sidebar needs and the catalog doesn't define — a placeholder color
// per kind (real icons come from #33) and each kind's default settings
// flattened into a props object ready for `customData`.

import {
  IconActivity,
  IconApi,
  IconArrowsSplit,
  IconBolt,
  IconBroadcast,
  IconBucket,
  IconClock,
  IconDatabase,
  IconDeviceLaptop,
  IconExternalLink,
  IconLambda,
  IconServer,
  IconShieldLock,
  IconStack2,
  IconWorld,
  type Icon,
} from '@tabler/icons-react'
import {
  CATALOG,
  type ComponentKind,
  type KindDefinition,
} from '../catalog/catalog'

export type { ComponentKind }

/** A sidebar entry: enough to list and place a kind on the board. */
export interface CatalogEntry {
  kind: ComponentKind
  label: string
  description: string
  color: string
  /** Tabler icon shown on tiles and cards. */
  icon: Icon
  /** Panel group the kind is listed under. */
  group: KindGroup
  defaultProps: Record<string, unknown>
}

export type KindGroup =
  'Clients & edge' | 'Compute' | 'Data' | 'Messaging' | 'Operations'

const KIND_LOOK: Readonly<
  Record<ComponentKind, { icon: Icon; group: KindGroup }>
> = {
  client: { icon: IconDeviceLaptop, group: 'Clients & edge' },
  cdn: { icon: IconWorld, group: 'Clients & edge' },
  load_balancer: { icon: IconArrowsSplit, group: 'Clients & edge' },
  api_gateway: { icon: IconApi, group: 'Clients & edge' },
  auth: { icon: IconShieldLock, group: 'Clients & edge' },
  service: { icon: IconServer, group: 'Compute' },
  serverless_function: { icon: IconLambda, group: 'Compute' },
  scheduler: { icon: IconClock, group: 'Compute' },
  database: { icon: IconDatabase, group: 'Data' },
  cache: { icon: IconBolt, group: 'Data' },
  object_storage: { icon: IconBucket, group: 'Data' },
  queue: { icon: IconStack2, group: 'Messaging' },
  pubsub: { icon: IconBroadcast, group: 'Messaging' },
  external_service: { icon: IconExternalLink, group: 'Operations' },
  monitoring: { icon: IconActivity, group: 'Operations' },
}

// Placeholder colors per kind, light enough to read on the navy canvas and
// card surface. Kinds in one panel group share a hue family. Designers will
// finalise these (#86).
const KIND_COLORS: Readonly<Record<ComponentKind, string>> = {
  client: '#a9b6cf',
  cdn: '#7dd3fc',
  load_balancer: '#81a6ee',
  api_gateway: '#a5b4fc',
  auth: '#c4b5fd',
  service: '#5eead4',
  serverless_function: '#86efac',
  scheduler: '#bef264',
  database: '#fbbf24',
  cache: '#fb923c',
  object_storage: '#fde68a',
  queue: '#f9a8d4',
  pubsub: '#f0abfc',
  external_service: '#cbd5e1',
  monitoring: '#fda4af',
}

function defaultPropsFor(kind: ComponentKind): Record<string, unknown> {
  const settings: KindDefinition['settings'] = CATALOG[kind].settings
  return Object.fromEntries(
    Object.entries(settings).map(([key, setting]) => [key, setting.default]),
  )
}

export const catalog: readonly CatalogEntry[] = Object.entries(CATALOG).map(
  ([kind, definition]) => {
    const componentKind = kind as ComponentKind
    return {
      kind: componentKind,
      label: definition.label,
      description: definition.description,
      color: KIND_COLORS[componentKind],
      ...KIND_LOOK[componentKind],
      defaultProps: defaultPropsFor(componentKind),
    }
  },
)

/** Size of a newly placed component, in scene units. */
export const COMPONENT_WIDTH = 200
export const COMPONENT_HEIGHT = 100

/** `dataTransfer` type used to carry a dragged kind onto the canvas. */
export const COMPONENT_DRAG_MIME = 'application/x-chalkline-kind'
