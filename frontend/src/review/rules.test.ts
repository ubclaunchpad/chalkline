import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import { arrow, component, healthyBoard } from '../checks/testBoard.ts'
import { deriveGraph } from '../graph/deriveGraph.ts'
import { reviewDiagram, scoreFor, type Finding } from './rules.ts'

const review = (elements: ExcalidrawElement[]) =>
  reviewDiagram(deriveGraph(elements))

const keys = (elements: ExcalidrawElement[]) =>
  review(elements).findings.map((finding) => finding.key)

/** The healthy board with some elements swapped out by id. */
const healthyWith = (...changes: ExcalidrawElement[]) => {
  const ids = new Set(changes.map((element) => element.id))
  return [
    ...healthyBoard().filter((element) => !ids.has(element.id)),
    ...changes,
  ]
}

describe('reviewDiagram', () => {
  it('scores a healthy board Good everywhere with no findings', () => {
    expect(review(healthyBoard())).toEqual({
      scores: { reliability: 'Good', scalability: 'Good', security: 'Good' },
      findings: [],
    })
  })

  it('has nothing to say about an empty board', () => {
    expect(review([]).findings).toEqual([])
  })

  it('flags a database with one replica', () => {
    const board = healthyWith(component('db', 'database', 'Orders DB'))
    expect(keys(board)).toEqual(['db-replica:db'])
    expect(review(board).scores.reliability).toBe('Needs work')
  })

  it('flags a single service instance behind a load balancer', () => {
    const board = [
      component('lb', 'load_balancer', 'LB'),
      component('s', 'service', 'API'),
      arrow('a1', 'lb', 's'),
    ]
    expect(keys(board)).toEqual(['lb-single:lb:s'])
    const scaled = [
      board[0],
      component('s', 'service', 'API', { instances: 2 }),
      board[2],
    ]
    expect(keys(scaled)).toEqual([])
  })

  it('flags clients that call services directly, and missing auth for them', () => {
    const board = [
      component('c', 'client', 'Web app'),
      component('s', 'service', 'API', { instances: 2 }),
      arrow('a1', 'c', 's'),
    ]
    expect(keys(board).sort()).toEqual(['direct:c:s', 'no-auth:c:s'])
    const withAuth = [...board, component('auth', 'auth', 'Auth')]
    expect(keys(withAuth)).toEqual(['direct:c:s', 'no-monitoring'])
  })

  it('flags a database read without a cache', () => {
    const board = healthyWith(arrow('a4', 'service', 'metrics'))
    const finding = review(board).findings.find((f) =>
      f.key.startsWith('no-cache'),
    )
    expect(finding?.elementIds).toEqual(['db', 'service'])
  })

  it('flags a queue nothing reads from, but not one with a consumer', () => {
    const board = [
      component('s', 'service', 'API', { instances: 2 }),
      component('q', 'queue', 'Jobs'),
      arrow('a1', 's', 'q', { kind: 'async' }),
    ]
    expect(keys(board)).toEqual(['no-consumer:q'])
    const consumed = [
      ...board,
      component('w', 'service', 'Worker', { instances: 2 }),
      arrow('a2', 'q', 'w', { kind: 'async' }),
    ]
    expect(keys(consumed)).toEqual(['no-monitoring'])
  })

  it('flags external calls unless the arrow mentions a timeout or retries', () => {
    const board = [
      component('s', 'service', 'API', { instances: 2 }),
      component('x', 'external_service', 'Stripe'),
      arrow('a1', 's', 'x'),
    ]
    expect(keys(board)).toEqual(['external:a1'])
    const labelled = [
      board[0],
      board[1],
      arrow('a1', 's', 'x', { label: 'HTTPS, timeout 2s' }),
    ]
    expect(keys(labelled)).toEqual([])
    const props = [
      board[0],
      board[1],
      arrow('a1', 's', 'x', { props: { retries: 3 } }),
    ]
    expect(keys(props)).toEqual([])
  })

  it('suggests monitoring once a board has three components', () => {
    const board = healthyBoard().filter(
      (element) => element.id !== 'metrics' && element.id !== 'a5',
    )
    expect(keys(board)).toEqual(['no-monitoring'])
    expect(review(board).scores.reliability).toBe('Fair')
  })

  it('flags a client-facing gateway with authentication off', () => {
    const board = healthyWith(
      component('gateway', 'api_gateway', 'API gateway', { auth: 'None' }),
    )
    expect(keys(board)).toEqual(['open-gateway:gateway'])
    expect(review(board).scores.security).toBe('Needs work')
  })

  it('lists high findings first', () => {
    const board = healthyWith(
      component('db', 'database', 'Orders DB'),
      arrow('a4', 'service', 'metrics'),
    )
    expect(review(board).findings.map((f) => f.high)).toEqual([true, false])
  })
})

describe('scoreFor', () => {
  const finding = (high: boolean): Finding => ({
    key: 'k',
    area: 'reliability',
    high,
    title: '',
    why: '',
    tryThis: '',
    elementIds: [],
  })

  it('maps findings to Good, Fair and Needs work', () => {
    expect(scoreFor([])).toBe('Good')
    expect(scoreFor([finding(false)])).toBe('Fair')
    expect(scoreFor([finding(true)])).toBe('Needs work')
    expect(scoreFor([finding(false), finding(false)])).toBe('Needs work')
  })
})
