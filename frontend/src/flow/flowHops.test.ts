import { describe, expect, it } from 'vitest'
import { arrow, component, healthyBoard } from '../checks/testBoard.ts'
import { deriveGraph } from '../graph/deriveGraph.ts'
import {
  ASYNC_MS,
  CALL_MS,
  flowHops,
  pointAlong,
  stepStarts,
} from './flowHops.ts'

const short = (hops: ReturnType<typeof flowHops>) =>
  hops.map((hop) => `${String(hop.step)}:${hop.from}>${hop.to}`)

describe('flowHops', () => {
  it('follows a chain one step at a time and splits at a fork', () => {
    const hops = flowHops(deriveGraph(healthyBoard()), 'client')
    expect(short(hops)).toEqual([
      '0:client>gateway',
      '1:gateway>service',
      '2:service>db',
      '2:service>cache',
    ])
  })

  it('visits each component once, so loops end', () => {
    const graph = deriveGraph([
      component('a', 'service', 'A'),
      component('b', 'service', 'B'),
      component('c', 'service', 'C'),
      arrow('e1', 'a', 'b'),
      arrow('e2', 'b', 'c'),
      arrow('e3', 'c', 'a'),
      arrow('e4', 'b', 'a'),
    ])
    expect(short(flowHops(graph, 'a'))).toEqual(['0:a>b', '1:b>c'])
  })

  it('reaches a shared target only once when two branches meet', () => {
    const graph = deriveGraph([
      component('a', 'service', 'A'),
      component('b', 'service', 'B'),
      component('c', 'service', 'C'),
      component('d', 'database', 'D'),
      arrow('e1', 'a', 'b'),
      arrow('e2', 'a', 'c'),
      arrow('e3', 'b', 'd'),
      arrow('e4', 'c', 'd'),
    ])
    expect(short(flowHops(graph, 'a'))).toEqual(['0:a>b', '0:a>c', '1:b>d'])
  })

  it('ignores arrows pointing into the start', () => {
    const graph = deriveGraph([
      component('a', 'service', 'A'),
      component('b', 'service', 'B'),
      arrow('e1', 'b', 'a'),
    ])
    expect(flowHops(graph, 'a')).toEqual([])
  })

  it('follows a two-way arrow backwards and marks it reversed', () => {
    const graph = deriveGraph([
      component('a', 'service', 'A'),
      component('b', 'service', 'B'),
      arrow('e1', 'b', 'a', { kind: 'two-way' }),
    ])
    expect(flowHops(graph, 'a')).toEqual([
      expect.objectContaining({ from: 'a', to: 'b', reverse: true }),
    ])
  })

  it('returns nothing for an isolated component or a missing start', () => {
    const graph = deriveGraph([component('a', 'service', 'A')])
    expect(flowHops(graph, 'a')).toEqual([])
    expect(flowHops(graph, 'nope')).toEqual([])
  })

  it('marks async arrows', () => {
    const graph = deriveGraph([
      component('a', 'service', 'A'),
      component('q', 'queue', 'Q'),
      arrow('e1', 'a', 'q', { kind: 'async' }),
    ])
    expect(flowHops(graph, 'a')[0]?.async).toBe(true)
  })
})

describe('stepStarts', () => {
  it('waits for the slowest hop in each step', () => {
    const graph = deriveGraph([
      component('a', 'service', 'A'),
      component('b', 'service', 'B'),
      component('q', 'queue', 'Q'),
      component('c', 'service', 'C'),
      arrow('e1', 'a', 'b'),
      arrow('e2', 'a', 'q', { kind: 'async' }),
      arrow('e3', 'b', 'c'),
    ])
    expect(stepStarts(flowHops(graph, 'a'))).toEqual([
      0,
      ASYNC_MS,
      ASYNC_MS + CALL_MS,
    ])
  })

  it('is just a zero start with no hops', () => {
    expect(stepStarts([])).toEqual([0])
  })
})

describe('pointAlong', () => {
  const bent = [
    [0, 0],
    [100, 0],
    [100, 100],
  ] as const

  it('moves by distance along bent arrows', () => {
    expect(pointAlong(bent, 0)).toEqual([0, 0])
    expect(pointAlong(bent, 0.25)).toEqual([50, 0])
    expect(pointAlong(bent, 0.75)).toEqual([100, 50])
    expect(pointAlong(bent, 1)).toEqual([100, 100])
  })

  it('clamps and copes with zero-length or empty lines', () => {
    expect(pointAlong(bent, 2)).toEqual([100, 100])
    expect(pointAlong([[5, 5]], 0.5)).toEqual([5, 5])
    expect(pointAlong([], 0.5)).toEqual([0, 0])
  })
})
