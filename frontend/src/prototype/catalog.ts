// Prototype component catalog. Kinds, colors, and fields are placeholders
// for the design and semantics teams to iterate on.

export type Kind =
  | 'client'
  | 'cdn'
  | 'load_balancer'
  | 'api_gateway'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'object_storage'

export type FieldDef =
  | { key: string; label: string; type: 'text'; default: string }
  | {
      key: string
      label: string
      type: 'number'
      default: number
      min?: number
    }
  | {
      key: string
      label: string
      type: 'select'
      options: string[]
      default: string
    }

export type KindDef = {
  kind: Kind
  label: string
  description: string
  background: string
  stroke: string
  fields: FieldDef[]
}

export const CATALOG: KindDef[] = [
  {
    kind: 'client',
    label: 'Client',
    description: 'Browser or mobile app making requests',
    background: '#f1f3f5',
    stroke: '#495057',
    fields: [
      {
        key: 'platform',
        label: 'Platform',
        type: 'select',
        options: ['Web', 'iOS', 'Android', 'Other'],
        default: 'Web',
      },
    ],
  },
  {
    kind: 'cdn',
    label: 'CDN',
    description: 'Caches static content near users',
    background: '#e7f5ff',
    stroke: '#1971c2',
    fields: [
      {
        key: 'ttl',
        label: 'Cache TTL (s)',
        type: 'number',
        default: 3600,
        min: 0,
      },
    ],
  },
  {
    kind: 'load_balancer',
    label: 'Load balancer',
    description: 'Spreads traffic across instances',
    background: '#fff4e6',
    stroke: '#e8590c',
    fields: [
      {
        key: 'algorithm',
        label: 'Algorithm',
        type: 'select',
        options: ['Round robin', 'Least connections', 'IP hash'],
        default: 'Round robin',
      },
    ],
  },
  {
    kind: 'api_gateway',
    label: 'API gateway',
    description: 'Single entry point: auth, routing, rate limits',
    background: '#f3f0ff',
    stroke: '#7048e8',
    fields: [
      {
        key: 'rateLimit',
        label: 'Rate limit (req/s)',
        type: 'number',
        default: 1000,
        min: 0,
      },
    ],
  },
  {
    kind: 'service',
    label: 'Service',
    description: 'Stateless application server',
    background: '#ebfbee',
    stroke: '#2f9e44',
    fields: [
      {
        key: 'instances',
        label: 'Instances',
        type: 'number',
        default: 2,
        min: 1,
      },
      { key: 'language', label: 'Language', type: 'text', default: 'Go' },
    ],
  },
  {
    kind: 'database',
    label: 'Database',
    description: 'Durable source of truth',
    background: '#e3fafc',
    stroke: '#0c8599',
    fields: [
      {
        key: 'engine',
        label: 'Engine',
        type: 'select',
        options: ['PostgreSQL', 'MySQL', 'MongoDB', 'DynamoDB'],
        default: 'PostgreSQL',
      },
      {
        key: 'replicas',
        label: 'Replicas',
        type: 'number',
        default: 1,
        min: 1,
      },
    ],
  },
  {
    kind: 'cache',
    label: 'Cache',
    description: 'Fast in-memory reads',
    background: '#fff0f6',
    stroke: '#c2255c',
    fields: [
      {
        key: 'engine',
        label: 'Engine',
        type: 'select',
        options: ['Redis', 'Memcached'],
        default: 'Redis',
      },
      {
        key: 'eviction',
        label: 'Eviction',
        type: 'select',
        options: ['LRU', 'LFU', 'TTL only'],
        default: 'LRU',
      },
    ],
  },
  {
    kind: 'queue',
    label: 'Queue',
    description: 'Buffers work between producers and consumers',
    background: '#fff9db',
    stroke: '#e67700',
    fields: [
      {
        key: 'delivery',
        label: 'Delivery',
        type: 'select',
        options: ['At least once', 'At most once', 'Exactly once'],
        default: 'At least once',
      },
    ],
  },
  {
    kind: 'object_storage',
    label: 'Object storage',
    description: 'Files, images, backups',
    background: '#f8f0fc',
    stroke: '#9c36b5',
    fields: [
      { key: 'bucket', label: 'Bucket', type: 'text', default: 'uploads' },
    ],
  },
]

export const KIND_DEFS = Object.fromEntries(
  CATALOG.map((d) => [d.kind, d]),
) as Record<Kind, KindDef>

export type ComponentData = {
  v: 1
  kind: Kind
  name: string
  props: Record<string, string | number>
}

export function isComponentData(value: unknown): value is ComponentData {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    v.v === 1 &&
    typeof v.kind === 'string' &&
    v.kind in KIND_DEFS &&
    typeof v.name === 'string' &&
    typeof v.props === 'object' &&
    v.props !== null
  )
}

export function defaultProps(kind: Kind): Record<string, string | number> {
  return Object.fromEntries(
    KIND_DEFS[kind].fields.map((f) => [f.key, f.default]),
  )
}
