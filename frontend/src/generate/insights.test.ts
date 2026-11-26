import { describe, expect, it } from 'vitest'
import type { ComponentKind } from '../catalog/catalog'
import type { ConnectionKind, Graph, GraphNode } from '../graph/deriveGraph'
import { catalog } from '../sidebar/catalog'
import { explainGraph } from './explain'
import { NEW, suggestNextSteps } from './suggest'

function graph(
  nodes: [string, ComponentKind, string][],
  edges: [string, string, ConnectionKind?][],
): Graph {
  return {
    nodes: Object.fromEntries(
      nodes.map(([id, kind, name]) => [
        id,
        {
          id,
          kind,
          name,
          v: 1,
          props: catalog.find((e) => e.kind === kind)?.defaultProps,
        } as GraphNode,
      ]),
    ),
    edges: Object.fromEntries(
      edges.map(([source, target, kind = 'call'], i) => [
        `e${String(i)}`,
        { id: `e${String(i)}`, source, target, connection: { kind } },
      ]),
    ),
    diagnostics: [],
  }
}

const shop = graph(
  [
    ['app', 'client', 'Mobile app'],
    ['gw', 'api_gateway', 'API gateway'],
    ['orders', 'service', 'Orders service'],
    ['db', 'database', 'Orders DB'],
    ['bus', 'pubsub', 'Kafka'],
    ['mail', 'service', 'Email worker'],
    ['lonely', 'scheduler', 'Nightly job'],
  ],
  [
    ['app', 'gw'],
    ['gw', 'orders'],
    ['orders', 'db'],
    ['orders', 'bus', 'async'],
    ['bus', 'mail', 'async'],
  ],
)

describe('explainGraph', () => {
  it('walks entry points, paths, stores, async work and loose ends', () => {
    expect(explainGraph(shop)).toEqual([
      'The board has 7 components and 5 connections.',
      'Requests start at Mobile app.',
      'Request path: Mobile app → API gateway → Orders service → Orders DB.',
      'Data is kept in Orders DB (PostgreSQL, used by Orders service).',
      'Kafka carries messages in the background from Orders service to Email worker.',
      'Not connected to anything yet: Nightly job.',
    ])
  })

  it('says when the board is empty', () => {
    expect(explainGraph(graph([], []))[0]).toMatch(/no components yet/)
  })

  it('copes with a loop and no entry point', () => {
    const loop = graph(
      [
        ['a', 'service', 'A'],
        ['b', 'service', 'B'],
      ],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    )
    expect(explainGraph(loop)[1]).toMatch(/no clear starting point/)
  })
})

describe('suggestNextSteps', () => {
  it('suggests a cache, auth, monitoring and connecting loose ends', () => {
    const steps = suggestNextSteps(shop)
    expect(steps.map((s) => s.id)).toEqual([
      'cache-db',
      'auth',
      'monitoring',
      'unconnected',
    ])
    expect(steps[0].add).toMatchObject({
      kind: 'cache',
      name: 'Orders DB cache',
      near: 'db',
      connections: [{ from: 'orders', to: NEW, kind: 'call' }],
    })
    expect(steps[3].add).toBeUndefined()
  })

  it('puts a load balancer between clients and a service', () => {
    const direct = graph(
      [
        ['web', 'client', 'Web'],
        ['api', 'service', 'API'],
      ],
      [['web', 'api']],
    )
    const lb = suggestNextSteps(direct).find((s) => s.id === 'lb-api')
    expect(lb?.add).toEqual({
      kind: 'load_balancer',
      name: 'Load balancer',
      near: 'api',
      connections: [
        { from: 'web', to: NEW, kind: 'call' },
        { from: NEW, to: 'api', kind: 'call' },
      ],
      remove: ['e0'],
    })
  })

  it('asks for a consumer when a queue has none', () => {
    const queue = graph(
      [
        ['svc', 'service', 'Checkout'],
        ['q', 'queue', 'Jobs'],
      ],
      [['svc', 'q', 'async']],
    )
    expect(suggestNextSteps(queue).map((s) => s.id)).toContain('consumer-q')
  })

  it('has nothing to say about an empty board', () => {
    expect(suggestNextSteps(graph([], []))).toEqual([])
  })
})
