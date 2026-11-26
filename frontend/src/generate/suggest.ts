// Short next steps for a board, each optionally with something to add.
import type { ComponentKind } from '../catalog/catalog'
import type { ConnectionKind, Graph, GraphNode } from '../graph/deriveGraph'
import { adjacency, listNames, MESSAGING_KINDS } from './explain'

/** Stands for the component a suggestion adds. */
export const NEW = 'new'

export interface Suggestion {
  id: string
  text: string
  /** What "Add it" puts on the board; missing for advice only. */
  add?: {
    kind: ComponentKind
    name: string
    /** Node to place the new component next to. */
    near: string
    /** Node ids, or NEW for the added component. */
    connections: { from: string; to: string; kind: ConnectionKind }[]
    /** Edges the new component replaces. */
    remove?: string[]
  }
}

const MAX_SUGGESTIONS = 5
const MAX_MONITORED = 4
const CALLERS: readonly ComponentKind[] = [
  'service',
  'serverless_function',
  'api_gateway',
]

export function suggestNextSteps(graph: Graph): Suggestion[] {
  const nodes = Object.values(graph.nodes)
  if (nodes.length === 0) return []
  const { out, into } = adjacency(graph)
  const node = (id: string) => graph.nodes[id]
  const has = (kind: ComponentKind) => nodes.some((n) => n.kind === kind)
  const ofKind = (kind: ComponentKind) => nodes.filter((n) => n.kind === kind)
  const callsKind = (n: GraphNode, kind: ComponentKind) =>
    (out.get(n.id) ?? []).some((e) => node(e.target).kind === kind)
  const suggestions: Suggestion[] = []

  for (const db of ofKind('database')) {
    const callers = (into.get(db.id) ?? [])
      .map((e) => node(e.source))
      .filter((n) => CALLERS.includes(n.kind))
    if (callers.length === 0 || callers.some((c) => callsKind(c, 'cache')))
      continue
    suggestions.push({
      id: `cache-${db.id}`,
      text: `Add a cache in front of ${db.name} so repeat reads skip the database.`,
      add: {
        kind: 'cache',
        name: `${db.name} cache`,
        near: db.id,
        connections: callers.map((c) => ({
          from: c.id,
          to: NEW,
          kind: 'call',
        })),
      },
    })
    break
  }

  const fronted = has('load_balancer') || has('api_gateway')
  for (const service of ofKind('service')) {
    const direct = (into.get(service.id) ?? []).filter(
      (e) => node(e.source).kind === 'client',
    )
    if (fronted || direct.length === 0) continue
    suggestions.push({
      id: `lb-${service.id}`,
      text: `Put a load balancer in front of ${service.name} so you can run more than one copy.`,
      add: {
        kind: 'load_balancer',
        name: 'Load balancer',
        near: service.id,
        connections: [
          ...direct.map((e) => ({
            from: e.source,
            to: NEW,
            kind: 'call' as const,
          })),
          { from: NEW, to: service.id, kind: 'call' },
        ],
        remove: direct.map((e) => e.id),
      },
    })
    break
  }

  for (const hub of nodes.filter((n) => MESSAGING_KINDS.includes(n.kind))) {
    if (out.has(hub.id)) continue
    suggestions.push({
      id: `consumer-${hub.id}`,
      text: `Nothing reads from ${hub.name} yet. Add a worker that consumes its messages.`,
      add: {
        kind: 'service',
        name: `${hub.name} worker`,
        near: hub.id,
        connections: [{ from: hub.id, to: NEW, kind: 'async' }],
      },
    })
  }

  const services = ofKind('service')
  const signInFrom = ofKind('api_gateway').at(0) ?? services.at(0)
  if (!has('auth') && has('client') && signInFrom) {
    suggestions.push({
      id: 'auth',
      text: `Add an auth component so ${signInFrom.name} can check who is signed in.`,
      add: {
        kind: 'auth',
        name: 'Auth',
        near: signInFrom.id,
        connections: [{ from: signInFrom.id, to: NEW, kind: 'call' }],
      },
    })
  }

  for (const db of ofKind('database')) {
    const replicas = (db.props as Record<string, unknown>).replicas
    if (replicas === 1 && (into.get(db.id) ?? []).length >= 2) {
      suggestions.push({
        id: `replica-${db.id}`,
        text: `${db.name} has one copy and several users. Raise Replicas in its settings so it isn't a single point of failure.`,
      })
    }
  }

  if (!has('monitoring') && services.length > 0 && nodes.length >= 4) {
    const watched = services.slice(0, MAX_MONITORED)
    suggestions.push({
      id: 'monitoring',
      text: 'Add monitoring so you hear about errors and slow requests.',
      add: {
        kind: 'monitoring',
        name: 'Monitoring',
        near: watched[watched.length - 1].id,
        connections: watched.map((s) => ({
          from: s.id,
          to: NEW,
          kind: 'async',
        })),
      },
    })
  }

  const lone = nodes.filter((n) => !out.has(n.id) && !into.has(n.id))
  if (lone.length > 0 && nodes.length > 1) {
    suggestions.push({
      id: 'unconnected',
      text: `Connect ${listNames(lone.map((n) => n.name))}. Nothing points to or from ${lone.length === 1 ? 'it' : 'them'} yet.`,
    })
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}
