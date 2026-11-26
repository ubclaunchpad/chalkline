// Pure pieces of the "Send request" animation: which arrows a request takes,
// when each hop runs, and where a dot sits along an arrow.

import type { Graph } from '../graph/deriveGraph.ts'

export interface Hop {
  edgeId: string
  from: string
  to: string
  /** Ring number: every hop in the same step runs at the same time. */
  step: number
  /** True when a two-way arrow is travelled from its end to its start. */
  reverse: boolean
  async: boolean
}

const compare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0

/**
 * Walks outward from `start` one ring of arrows at a time (breadth-first).
 * Each component is reached once, so loops end; plain arrows pointing into
 * the start are never followed. Two-way arrows can be followed either way.
 */
export function flowHops(graph: Graph, start: string): Hop[] {
  if (!Object.hasOwn(graph.nodes, start)) return []
  const edges = Object.values(graph.edges).sort((left, right) =>
    compare(left.id, right.id),
  )
  const reached = new Set([start])
  const hops: Hop[] = []
  let frontier = [start]
  for (let step = 0; frontier.length > 0; step += 1) {
    const next: string[] = []
    for (const node of frontier) {
      for (const edge of edges) {
        const reverse =
          edge.target === node &&
          edge.source !== node &&
          edge.connection.kind === 'two-way'
        if (edge.source !== node && !reverse) continue
        const to = reverse ? edge.source : edge.target
        if (reached.has(to)) continue
        reached.add(to)
        next.push(to)
        hops.push({
          edgeId: edge.id,
          from: node,
          to,
          step,
          reverse,
          async: edge.connection.kind === 'async',
        })
      }
    }
    frontier = next
  }
  return hops
}

export const CALL_MS = 900
export const ASYNC_MS = 1500

export const hopDuration = (hop: Hop) => (hop.async ? ASYNC_MS : CALL_MS)

/** Start time of each step; the last entry is when the whole run ends. */
export function stepStarts(hops: readonly Hop[]): number[] {
  const longest: number[] = []
  for (const hop of hops) {
    longest[hop.step] = Math.max(longest[hop.step] ?? 0, hopDuration(hop))
  }
  const starts = [0]
  for (const duration of longest) {
    starts.push((starts.at(-1) ?? 0) + duration)
  }
  return starts
}

export type Point = readonly [number, number]

/** The point a fraction `t` (0 to 1) of the way along a polyline, by length. */
export function pointAlong(points: readonly Point[], t: number): Point {
  const segments = points
    .slice(1)
    .map((to, i) => ({ from: points.at(i) ?? to, to }))
    .map(({ from, to }) => ({
      from,
      to,
      length: Math.hypot(to[0] - from[0], to[1] - from[1]),
    }))
  const total = segments.reduce((sum, { length }) => sum + length, 0)
  let remaining = Math.min(Math.max(t, 0), 1) * total
  for (const { from, to, length } of segments) {
    if (remaining <= length && length > 0) {
      const f = remaining / length
      return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]
    }
    remaining -= length
  }
  return points.at(-1) ?? [0, 0]
}

export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
