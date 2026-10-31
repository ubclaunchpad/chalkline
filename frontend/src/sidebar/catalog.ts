// Sidebar-facing view over the shared component catalog (#30): adds what
// the sidebar needs and the catalog doesn't define — a placeholder color
// per kind (real icons come from #33) and each kind's default settings
// flattened into a props object ready for `customData`.

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
  defaultProps: Record<string, unknown>
}

// Placeholder colors per kind until #33 ships real icons.
const KIND_COLORS: Readonly<Record<ComponentKind, string>> = {
  client: '#868e96',
  cdn: '#20c997',
  load_balancer: '#7048e8',
  api_gateway: '#1098ad',
  service: '#4dabf7',
  database: '#f08c00',
  cache: '#e64980',
  queue: '#f76707',
  object_storage: '#37b24d',
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
      defaultProps: defaultPropsFor(componentKind),
    }
  },
)

/** Size of a newly placed component, in scene units. */
export const COMPONENT_WIDTH = 180
export const COMPONENT_HEIGHT = 100

/** `dataTransfer` type used to carry a dragged kind onto the canvas. */
export const COMPONENT_DRAG_MIME = 'application/x-chalkline-kind'

/** The minimum a component's `customData` needs for name bookkeeping. */
interface NamedComponentData {
  v: 1
  kind: ComponentKind
  name: string
  props: Record<string, unknown>
}

// Lenient shape check for collecting names already used on the board. Unlike
// validateComponent (frontend/src/catalog/validate.ts), this doesn't require
// props to fully match the kind's settings, so a component saved under an
// older version of a kind's settings still has its name counted as taken.
export function isComponentData(value: unknown): value is NamedComponentData {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const data = value as Record<string, unknown>
  return (
    data.v === 1 &&
    typeof data.kind === 'string' &&
    Object.hasOwn(CATALOG, data.kind) &&
    typeof data.name === 'string' &&
    typeof data.props === 'object' &&
    data.props !== null
  )
}
