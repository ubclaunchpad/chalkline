import { describe, expect, it } from 'vitest'
import { graphOf } from '../export/graphFixture'
import { EXERCISES } from './exercises'
import {
  cacheInFrontOfDatabase,
  clientReachesDatabase,
  databaseReplicas,
  hasKind,
  servicesScaleOut,
  twoWayClient,
  writesThroughQueue,
} from './rubric'

describe('cacheInFrontOfDatabase', () => {
  it('passes when one service calls both the cache and the database', () => {
    const graph = graphOf(
      [
        ['s', 'service', 'API'],
        ['c', 'cache', 'Redis'],
        ['d', 'database', 'DB'],
      ],
      [
        ['s', 'c'],
        ['s', 'd'],
      ],
    )
    expect(cacheInFrontOfDatabase.check(graph).pass).toBe(true)
  })

  it('passes when the cache reads through to the database', () => {
    const graph = graphOf(
      [
        ['c', 'cache', 'Redis'],
        ['d', 'database', 'DB'],
      ],
      [['c', 'd']],
    )
    expect(cacheInFrontOfDatabase.check(graph).pass).toBe(true)
  })

  it('fails when the cache is not connected to the database path', () => {
    const graph = graphOf(
      [
        ['s', 'service', 'API'],
        ['t', 'service', 'Other'],
        ['c', 'cache', 'Redis'],
        ['d', 'database', 'DB'],
      ],
      [
        ['s', 'c'],
        ['t', 'd'],
      ],
    )
    const result = cacheInFrontOfDatabase.check(graph)
    expect(result.pass).toBe(false)
    expect(result.why).toMatch(/Connect the cache/)
  })

  it('fails with a reason when the cache or database is missing', () => {
    expect(
      cacheInFrontOfDatabase.check(graphOf([['d', 'database', 'DB']])).why,
    ).toMatch(/Add a cache/)
    expect(
      cacheInFrontOfDatabase.check(graphOf([['c', 'cache', 'C']])).why,
    ).toMatch(/Add a database/)
  })
})

describe('databaseReplicas', () => {
  it('needs every database at the minimum', () => {
    const check = databaseReplicas(2).check
    expect(check(graphOf([])).pass).toBe(false)
    expect(check(graphOf([['d', 'database', 'DB']])).pass).toBe(false)
    expect(
      check(graphOf([['d', 'database', 'DB', { replicas: 2 }]])).pass,
    ).toBe(true)
    const mixed = check(
      graphOf([
        ['a', 'database', 'Main', { replicas: 3 }],
        ['b', 'database', 'Logs', { replicas: 1 }],
      ]),
    )
    expect(mixed.pass).toBe(false)
    expect(mixed.why).toMatch(/^Logs:/)
  })
})

describe('writesThroughQueue', () => {
  it('passes when a fed queue leads on to a database', () => {
    const graph = graphOf(
      [
        ['s', 'service', 'API'],
        ['q', 'queue', 'Writes'],
        ['w', 'service', 'Worker'],
        ['d', 'database', 'DB'],
      ],
      [
        ['s', 'q', 'async'],
        ['q', 'w'],
        ['w', 'd'],
      ],
    )
    expect(writesThroughQueue.check(graph).pass).toBe(true)
  })

  it('fails for a dead-end queue or one nothing feeds', () => {
    const deadEnd = graphOf(
      [
        ['s', 'service', 'API'],
        ['q', 'queue', 'Q'],
        ['d', 'database', 'DB'],
      ],
      [
        ['s', 'q'],
        ['s', 'd'],
      ],
    )
    expect(writesThroughQueue.check(deadEnd).pass).toBe(false)
    const unfed = graphOf(
      [
        ['q', 'pubsub', 'Q'],
        ['d', 'database', 'DB'],
      ],
      [['q', 'd']],
    )
    expect(writesThroughQueue.check(unfed).pass).toBe(false)
    expect(writesThroughQueue.check(graphOf([])).why).toMatch(/Add a queue/)
  })
})

describe('clientReachesDatabase', () => {
  it('follows connections and two-way edges in both directions', () => {
    const graph = graphOf(
      [
        ['c', 'client', 'App'],
        ['s', 'service', 'API'],
        ['d', 'database', 'DB'],
      ],
      [
        ['c', 's'],
        ['d', 's', 'two-way'],
      ],
    )
    expect(clientReachesDatabase.check(graph).pass).toBe(true)
  })

  it('respects one-way direction and survives cycles', () => {
    const graph = graphOf(
      [
        ['c', 'client', 'App'],
        ['s', 'service', 'A'],
        ['t', 'service', 'B'],
        ['d', 'database', 'DB'],
      ],
      [
        ['c', 's'],
        ['s', 't'],
        ['t', 's'],
        ['d', 's'],
      ],
    )
    expect(clientReachesDatabase.check(graph).pass).toBe(false)
  })
})

describe('other checks', () => {
  it('twoWayClient needs a two-way edge touching a client', () => {
    const nodes: Parameters<typeof graphOf>[0] = [
      ['c', 'client', 'App'],
      ['s', 'service', 'API'],
    ]
    expect(twoWayClient.check(graphOf(nodes, [['c', 's']])).pass).toBe(false)
    expect(
      twoWayClient.check(graphOf(nodes, [['s', 'c', 'two-way']])).pass,
    ).toBe(true)
  })

  it('servicesScaleOut needs 2+ instances on every service', () => {
    expect(servicesScaleOut.check(graphOf([['s', 'service', 'A']])).pass).toBe(
      false,
    )
    expect(
      servicesScaleOut.check(graphOf([['s', 'service', 'A', { instances: 3 }]]))
        .pass,
    ).toBe(true)
  })

  it('hasKind finds a component of that kind', () => {
    const item = hasKind('monitoring', 'Has monitoring', 'Add monitoring.')
    expect(item.check(graphOf([])).pass).toBe(false)
    expect(item.check(graphOf([['m', 'monitoring', 'Grafana']])).why).toBe(
      'Grafana is on the board.',
    )
  })
})

describe('EXERCISES', () => {
  it('has complete exercises with unique ids', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(4)
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length)
    for (const exercise of EXERCISES) {
      expect(exercise.functional.length).toBeGreaterThan(0)
      expect(exercise.nonFunctional.length).toBeGreaterThan(0)
      expect(exercise.constraints.length).toBeGreaterThan(0)
      expect(exercise.hints.length).toBeGreaterThan(0)
      expect(exercise.rubric.length).toBeGreaterThan(0)
      // Every rubric fails on an empty board, so nothing is free.
      for (const item of exercise.rubric) {
        expect(item.check(graphOf([])).pass).toBe(false)
      }
    }
  })
})
