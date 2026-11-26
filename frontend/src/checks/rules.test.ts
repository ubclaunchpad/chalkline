import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import { deriveGraph } from '../graph/deriveGraph.ts'
import { CHECK_COUNT, runChecks } from './rules.ts'
import { arrow, component, healthyBoard } from './testBoard.ts'

const check = (elements: ExcalidrawElement[]) =>
  runChecks(deriveGraph(elements), elements)

const messages = (elements: ExcalidrawElement[]) =>
  check(elements).map((problem) => problem.message)

describe('runChecks', () => {
  it('finds nothing wrong with a healthy board', () => {
    expect(check(healthyBoard())).toEqual([])
    expect(CHECK_COUNT).toBe(9)
  })

  it('finds nothing on an empty board', () => {
    expect(check([])).toEqual([])
  })

  it('flags an arrow attached at only one end, naming the attached side', () => {
    const board = [
      component('cache', 'cache', 'Redis'),
      component('db', 'database', 'Orders DB'),
      arrow('a1', 'cache', 'db'),
      arrow('loose', 'cache', null),
      arrow('loose2', null, 'db'),
    ]
    const problems = check(board).filter((p) => p.severity === 'error')
    expect(problems).toEqual([
      expect.objectContaining({
        elementId: 'loose',
        message:
          "The arrow from Redis isn't attached to anything at its other end.",
      }),
      expect.objectContaining({
        elementId: 'loose2',
        message:
          "The arrow into Orders DB isn't attached to anything at its start.",
      }),
    ])
  })

  it('flags broken component data as an error, once per component', () => {
    const broken = component('db', 'database', 'Orders DB', { replicas: 0 })
    const problems = check([broken])
    expect(problems[0]).toMatchObject({
      elementId: 'db',
      severity: 'error',
    })
    expect(problems[0]?.message).toContain('Orders DB')
    expect(problems.filter((p) => p.elementId === 'db')).toHaveLength(1)
  })

  it('warns about a component with no connections', () => {
    expect(messages([component('cache', 'cache', 'Redis')])).toEqual([
      'Redis has no connections.',
    ])
  })

  it('warns when a client talks straight to a database, in either direction of a two-way arrow', () => {
    const board = [
      component('c', 'client', 'Web app'),
      component('db', 'database', 'Orders DB'),
      arrow('a1', 'c', 'db'),
    ]
    expect(messages(board)).toContain(
      'Web app talks directly to Orders DB. This usually goes through an API.',
    )
    const twoWay = [
      board[0],
      board[1],
      arrow('a1', 'db', 'c', { kind: 'two-way' }),
    ]
    expect(check(twoWay).map((p) => p.elementId)).toContain('a1')
    const oneWayBack = [board[0], board[1], arrow('a1', 'db', 'c')]
    expect(messages(oneWayBack).join()).not.toContain('talks directly')
  })

  it('warns about a database nothing reads from, but not one with a two-way arrow', () => {
    const board = [
      component('s', 'service', 'Orders service'),
      component('db', 'database', 'Orders DB'),
      arrow('a1', 'db', 's'),
    ]
    expect(messages(board)).toContain('Orders DB has nothing reading from it.')
    const twoWay = [
      board[0],
      board[1],
      arrow('a1', 'db', 's', { kind: 'two-way' }),
    ]
    expect(messages(twoWay)).toEqual([])
  })

  it('does not double-report an unconnected database', () => {
    expect(messages([component('db', 'database', 'Orders DB')])).toEqual([
      'Orders DB has no connections.',
    ])
  })

  it('warns about an empty text setting', () => {
    const board = [
      component('g', 'api_gateway', 'Public API', { basePath: '  ' }),
      component('s', 'service', 'Orders service'),
      arrow('a1', 'g', 's'),
    ]
    expect(messages(board)).toEqual(['Public API is missing its base path.'])
  })

  it('warns about async messages sent straight to a client', () => {
    const board = [
      component('q', 'queue', 'Orders queue'),
      component('c', 'client', 'Web app'),
      arrow('a1', 'q', 'c', { kind: 'async' }),
    ]
    expect(check(board)).toEqual([
      expect.objectContaining({ elementId: 'a1', severity: 'warning' }),
    ])
    const call = [board[0], board[1], arrow('a1', 'q', 'c')]
    expect(check(call)).toEqual([])
  })

  it('warns about an arrow that loops back into its own component', () => {
    const board = [component('s', 'service', 'Worker'), arrow('a1', 's', 's')]
    expect(messages(board)).toEqual([
      'An arrow from Worker loops back into itself.',
    ])
  })

  it('warns on every component that shares a name, ignoring case', () => {
    const board = [
      component('d1', 'database', 'Database', { replicas: 2 }),
      component('d2', 'database', 'database'),
      component('s', 'service', 'API'),
      arrow('a1', 's', 'd1'),
      arrow('a2', 's', 'd2'),
    ]
    expect(check(board).map((p) => p.elementId)).toEqual(['d1', 'd2'])
  })

  it('lists errors before warnings', () => {
    const board = [
      component('cache', 'cache', 'Redis'),
      component('s', 'service', 'API'),
      arrow('loose', 's', null),
    ]
    expect(check(board).map((p) => p.severity)).toEqual([
      'error',
      'warning',
      'warning',
    ])
  })

  it('ignores deleted elements', () => {
    const deleted = { ...component('cache', 'cache', 'Redis'), isDeleted: true }
    expect(check([deleted])).toEqual([])
  })
})
