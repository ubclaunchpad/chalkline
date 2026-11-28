// Sidebar-facing view over the shared component catalog (#30): adds what
// the sidebar and the board need and the catalog doesn't define — a
// placeholder color per kind, the kind's Figma icon, and each kind's default
// settings flattened into a props object ready for `customData`.

import apiGatewayIcon from '../assets/icons/api_gateway.svg?raw'
import authIcon from '../assets/icons/auth.svg?raw'
import cacheIcon from '../assets/icons/cache.svg?raw'
import cdnIcon from '../assets/icons/cdn.svg?raw'
import clientIcon from '../assets/icons/client_web.svg?raw'
import databaseIcon from '../assets/icons/database.svg?raw'
import externalServiceIcon from '../assets/icons/external_service.svg?raw'
import loadBalancerIcon from '../assets/icons/load_balancer.svg?raw'
import monitoringIcon from '../assets/icons/monitoring.svg?raw'
import objectStorageIcon from '../assets/icons/object_storage.svg?raw'
import pubsubIcon from '../assets/icons/pubsub.svg?raw'
import queueIcon from '../assets/icons/queue.svg?raw'
import schedulerIcon from '../assets/icons/scheduler.svg?raw'
import serverlessFunctionIcon from '../assets/icons/serverless_function.svg?raw'
import serviceIcon from '../assets/icons/service.svg?raw'
import {
  CATALOG,
  type ComponentKind,
  type KindDefinition,
} from '../catalog/catalog'

export type { ComponentKind }

/** DOM id of the components panel, shared by the controls that toggle it. */
export const COMPONENT_SIDEBAR_ID = 'component-sidebar'

/** A sidebar entry: enough to list and place a kind on the board. */
export interface CatalogEntry {
  kind: ComponentKind
  label: string
  description: string
  color: string
  /** SVG markup of the kind's Figma icon; its strokes use `currentColor`. */
  icon: string
  defaultProps: Record<string, unknown>
}

// Placeholder colors per kind until design approves real ones (#86).
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
  serverless_function: '#4c6ef5',
  pubsub: '#be4bdb',
  auth: '#f03e3e',
  external_service: '#74b816',
  scheduler: '#ffd43b',
  monitoring: '#b197fc',
}

// Icons exported from the Figma icon set (#76). Client has web and mobile
// variants; the kind uses the web one.
const KIND_ICONS: Readonly<Record<ComponentKind, string>> = {
  client: clientIcon,
  cdn: cdnIcon,
  load_balancer: loadBalancerIcon,
  api_gateway: apiGatewayIcon,
  service: serviceIcon,
  database: databaseIcon,
  cache: cacheIcon,
  queue: queueIcon,
  object_storage: objectStorageIcon,
  serverless_function: serverlessFunctionIcon,
  pubsub: pubsubIcon,
  auth: authIcon,
  external_service: externalServiceIcon,
  scheduler: schedulerIcon,
  monitoring: monitoringIcon,
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
      icon: KIND_ICONS[componentKind],
      defaultProps: defaultPropsFor(componentKind),
    }
  },
)

/** `dataTransfer` type used to carry a dragged kind onto the canvas. */
export const COMPONENT_DRAG_MIME = 'application/x-chalkline-kind'
