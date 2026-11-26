import { describe, expect, it } from 'vitest'
import { layoutGraph, type LayoutEdge, type Point } from './layout'

const SIZE = { nodeWidth: 100, nodeHeight: 50, gapX: 50, gapY: 20 }
const edge = (source: string, target: string): LayoutEdge => ({
  source,
  target,
})

function overlaps(points: Point[]): boolean {
  return points.some((a, i) =>
    points
      .slice(i + 1)
      .some(
        (b) =>
          Math.abs(a.x - b.x) < SIZE.nodeWidth &&
          Math.abs(a.y - b.y) < SIZE.nodeHeight,
      ),
  )
}

describe('layoutGraph', () => {
  it('puts a chain left to right on one row', () => {
    const at = layoutGraph(
      ['c', 'a', 'b'],
      [edge('a', 'b'), edge('b', 'c')],
      SIZE,
    )
    expect(at.get('a')).toEqual({ x: 50, y: 25 })
    expect(at.get('b')).toEqual({ x: 200, y: 25 })
    expect(at.get('c')).toEqual({ x: 350, y: 25 })
  })

  it('uses the longest path to pick a layer', () => {
    const at = layoutGraph(
      ['a', 'b', 'c'],
      [edge('a', 'c'), edge('a', 'b'), edge('b', 'c')],
      SIZE,
    )
    expect(at.get('c')?.x).toBe(350)
  })

  it('handles cycles without losing nodes', () => {
    const at = layoutGraph(
      ['a', 'b', 'c'],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
      SIZE,
    )
    expect(at.size).toBe(3)
    expect(new Set([...at.values()].map((p) => p.x)).size).toBe(3)
  })

  it('orders a layer to avoid crossings', () => {
    // e fans out to a (top) and b (bottom); a links to d and b to c, so d
    // should end up above c.
    const at = layoutGraph(
      ['e', 'a', 'b', 'c', 'd'],
      [edge('e', 'a'), edge('e', 'b'), edge('a', 'd'), edge('b', 'c')],
      SIZE,
    )
    expect(at.get('a')?.y).toBeLessThan(at.get('b')?.y ?? 0)
    expect(at.get('d')?.y).toBeLessThan(at.get('c')?.y ?? 0)
  })

  it('stacks disconnected parts and lone nodes without overlap', () => {
    const at = layoutGraph(
      ['a', 'b', 'x', 'y', 'z', 'lone1', 'lone2'],
      [edge('a', 'b'), edge('x', 'y'), edge('x', 'z'), edge('q', 'a')],
      SIZE,
    )
    expect(at.size).toBe(7)
    expect(overlaps([...at.values()])).toBe(false)
    const ys = ['a', 'x', 'lone1'].map((id) => at.get(id)?.y ?? 0)
    expect(ys[0]).toBeLessThan(ys[1])
    expect(ys[1]).toBeLessThan(ys[2])
  })

  it('is deterministic and starts at the origin', () => {
    const ids = ['a', 'b', 'c', 'd']
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('c', 'd')]
    const first = layoutGraph(ids, edges, SIZE)
    expect(layoutGraph(ids, edges, SIZE)).toEqual(first)
    const xs = [...first.values()].map((p) => p.x - 50)
    const ys = [...first.values()].map((p) => p.y - 25)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
  })
})
