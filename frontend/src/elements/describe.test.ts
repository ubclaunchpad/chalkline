import { describe, expect, it } from 'vitest'
import type { ComponentData } from '../catalog/catalog'
import { validateComponent } from '../catalog/validate'
import { catalog } from '../sidebar/catalog'
import { cardLabel, describeComponent, formatDuration } from './describe'

const component = (kind: string, props: Record<string, unknown>) => {
  const entry = catalog.find((e) => e.kind === kind)
  const result = validateComponent({
    v: 1,
    kind,
    name: 'Thing',
    props: { ...entry?.defaultProps, ...props },
  })
  if (!result.ok) throw new Error(result.problems.join(', '))
  return result.data
}

describe('formatDuration', () => {
  it.each([
    [86400, '1d'],
    [7200, '2h'],
    [300, '5m'],
    [45, '45s'],
    [90, '90s'],
  ])('%i seconds is %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})

describe('describeComponent', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['database', { replicas: 2 }, 'PostgreSQL · 2 replicas'],
    ['database', {}, 'PostgreSQL · 1 replica'],
    ['service', { instances: 3, protocol: 'gRPC' }, 'gRPC · 3 instances'],
    ['scheduler', {}, 'cron 0 * * * *'],
    ['cache', {}, 'Redis · TTL 5m'],
    ['cdn', {}, 'Pull · TTL 1d'],
    ['load_balancer', { layer: 'Layer 4' }, 'L4 · Round robin'],
    ['api_gateway', {}, '/api · JWT · 100/s'],
    ['queue', {}, 'RabbitMQ · at-least-once'],
    ['client', { platform: 'Mobile' }, 'Mobile'],
    ['monitoring', {}, 'Prometheus · 15d'],
  ])('%s %j reads "%s"', (kind, props, text) => {
    expect(describeComponent(component(kind, props))).toBe(text)
  })

  it('has a non-empty line for every kind with default settings', () => {
    for (const entry of catalog) {
      expect(describeComponent(component(entry.kind, {}))).not.toBe('')
    }
  })
})

describe('cardLabel', () => {
  it('puts the name above the detail', () => {
    const data: ComponentData = component('database', { replicas: 2 })
    expect(cardLabel({ ...data, name: 'Users DB' })).toBe(
      'Users DB\nPostgreSQL · 2 replicas',
    )
  })
})
