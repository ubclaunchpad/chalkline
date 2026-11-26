import { describe, expect, it } from 'vitest'
import { parseDescription } from './parse'

/** The draft as readable strings: "Name (kind)" and "A -> B (kind)". */
function read(text: string) {
  const draft = parseDescription(text)
  const name = (key: string) =>
    draft.components.find((c) => c.key === key)?.name ?? key
  return {
    components: draft.components.map((c) => `${c.name} (${c.kind})`),
    connections: draft.connections.map(
      (c) => `${name(c.from)} -> ${name(c.to)} (${c.kind})`,
    ),
    draft,
  }
}

describe('parseDescription', () => {
  it('drafts the example from the panel', () => {
    const { components, connections } = read(
      'A mobile app talks to an API gateway, which calls an orders service and a users service. Orders writes to Postgres and publishes events to Kafka; an email worker consumes them.',
    )
    expect(components).toEqual([
      'Mobile app (client)',
      'API gateway (api_gateway)',
      'Orders service (service)',
      'Users service (service)',
      'Postgres (database)',
      'Kafka (pubsub)',
      'Email worker (service)',
    ])
    expect(connections).toEqual([
      'Mobile app -> API gateway (call)',
      'API gateway -> Orders service (call)',
      'API gateway -> Users service (call)',
      'Orders service -> Postgres (call)',
      'Orders service -> Kafka (async)',
      'Kafka -> Email worker (async)',
    ])
  })

  it('maps brand names to kinds and settings', () => {
    const { draft } = read(
      'The web app uses a Redis cache, MySQL, S3 and a Lambda. Payments go through Stripe.',
    )
    const byName = Object.fromEntries(draft.components.map((c) => [c.name, c]))
    expect(byName['Web app'].kind).toBe('client')
    expect(byName['Redis cache']).toMatchObject({
      kind: 'cache',
      props: { engine: 'Redis' },
    })
    expect(byName.MySQL).toMatchObject({
      kind: 'database',
      props: { engine: 'MySQL' },
    })
    expect(byName.S3.kind).toBe('object_storage')
    expect(byName.Lambda.kind).toBe('serverless_function')
    expect(byName.Stripe.kind).toBe('external_service')
  })

  it('follows arrows written as ->', () => {
    const { connections } = read('Browser -> CDN -> load balancer -> API')
    expect(connections).toEqual([
      'Browser -> CDN (call)',
      'CDN -> Load balancer (call)',
      'Load balancer -> API (call)',
    ])
  })

  it('makes queue traffic async and points consumers the right way', () => {
    const { connections } = read(
      'The checkout service sends jobs to an SQS queue. A billing worker consumes from the queue. A cron job triggers the billing worker.',
    )
    expect(connections).toEqual([
      'Checkout service -> SQS queue (async)',
      'SQS queue -> Billing worker (async)',
      'Cron job -> Billing worker (async)',
    ])
  })

  it('starts a new clause when a listed object has its own verb', () => {
    const { connections } = read(
      'The gateway calls the orders service and the users service reads from Postgres.',
    )
    expect(connections).toEqual([
      'Gateway -> Orders service (call)',
      'Users service -> Postgres (call)',
    ])
  })

  it('treats "auth service" as auth and reuses "the gateway"', () => {
    const { components, connections } = read(
      'An API gateway checks an auth service. The gateway forwards to a search service.',
    )
    expect(components).toEqual([
      'API gateway (api_gateway)',
      'Auth service (auth)',
      'Search service (service)',
    ])
    expect(connections).toHaveLength(2)
  })

  it('reads a leading "it" as the previous subject', () => {
    const { connections } = read(
      'The API reads from a Redis cache and writes to MySQL. It uploads images to S3.',
    )
    expect(connections).toContain('API -> S3 (call)')
  })

  it('returns nothing for text with no components', () => {
    expect(read('I like turtles.').draft).toEqual({
      components: [],
      connections: [],
    })
  })
})

describe('external services by brand', () => {
  it('recognises Firebase as an external service', () => {
    const draft = parseDescription(
      'The notification worker sends push notifications through Firebase.',
    )
    expect(draft.components.map((c) => c.kind)).toContain('external_service')
  })
})
