import { describe, expect, it } from 'vitest'
import {
  CATALOG,
  type ComponentData,
  type KindDefinition,
} from '../catalog/catalog.ts'
import { validateComponent } from '../catalog/validate.ts'
import { describeComponent, formatDuration } from './describe.ts'

// Builds valid component data from the catalog defaults plus overrides, so a
// test fails loudly if it uses a setting the catalog does not define.
function component(
  kind: keyof typeof CATALOG,
  props: Record<string, unknown> = {},
): ComponentData {
  const settings: KindDefinition['settings'] = CATALOG[kind].settings
  const defaults = Object.fromEntries(
    Object.entries(settings).map(([key, setting]) => [key, setting.default]),
  )
  const result = validateComponent({
    v: 1,
    kind,
    name: 'Example',
    props: { ...defaults, ...props },
  })
  if (!result.ok) {
    throw new Error(result.problems.join('; '))
  }
  return result.data
}

describe('formatDuration', () => {
  it.each([
    [86400, '1d'],
    [172800, '2d'],
    [7200, '2h'],
    [300, '5m'],
    [90, '90s'],
    [45, '45s'],
    [1, '1s'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('describeComponent', () => {
  it.each([
    ['client', 'Web'],
    ['cdn', 'Pull · TTL 1d'],
    ['load_balancer', 'L7 · Round robin'],
    ['api_gateway', '/api · JWT · 100/s'],
    ['service', 'HTTP · 1 instance'],
    ['database', 'PostgreSQL · 1 replica'],
    ['cache', 'Redis · TTL 5m'],
    ['queue', 'RabbitMQ · At-least-once'],
    ['object_storage', 'Amazon S3 · Standard'],
    ['serverless_function', 'AWS Lambda · HTTP'],
    ['pubsub', 'Kafka · At-least-once'],
    ['auth', 'OpenID Connect · JWT'],
    ['external_service', 'Other · API calls'],
    ['scheduler', 'cron · 0 * * * *'],
    ['monitoring', 'Prometheus · 15d'],
  ] as const)('describes the default %s', (kind, expected) => {
    expect(describeComponent(component(kind))).toBe(expected)
  })

  it('covers every kind in the catalog', () => {
    for (const kind of Object.keys(CATALOG) as (keyof typeof CATALOG)[]) {
      expect(describeComponent(component(kind))).not.toBe('')
    }
  })

  it('uses the plural for more than one', () => {
    expect(describeComponent(component('database', { replicas: 3 }))).toBe(
      'PostgreSQL · 3 replicas',
    )
    expect(describeComponent(component('service', { instances: 2 }))).toBe(
      'HTTP · 2 instances',
    )
  })

  it('shortens a Layer 4 load balancer to L4', () => {
    expect(
      describeComponent(component('load_balancer', { layer: 'Layer 4' })),
    ).toBe('L4 · Round robin')
  })

  it('reflects changed settings', () => {
    expect(
      describeComponent(
        component('cache', { engine: 'Memcached', ttlSeconds: 45 }),
      ),
    ).toBe('Memcached · TTL 45s')
  })
})
