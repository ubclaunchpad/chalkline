// Rubric checks for practice exercises. Each one is a pure function of the
// architecture graph that says whether the diagram meets a goal and why.

import type { ComponentKind } from '../catalog/catalog'
import type { Graph, GraphNode } from '../graph/deriveGraph'

export interface CheckResult {
  pass: boolean
  why: string
}

export interface RubricItem {
  id: string
  label: string
  check: (graph: Graph) => CheckResult
}

const nodesOf = (graph: Graph, ...kinds: ComponentKind[]): GraphNode[] =>
  Object.values(graph.nodes).filter((node) => kinds.includes(node.kind))

/** Ids each node sends to. Two-way connections go both ways. */
function outgoing(graph: Graph): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (from: string, to: string) => {
    const set = out.get(from) ?? new Set<string>()
    set.add(to)
    out.set(from, set)
  }
  for (const edge of Object.values(graph.edges)) {
    add(edge.source, edge.target)
    if (edge.connection.kind === 'two-way') add(edge.target, edge.source)
  }
  return out
}

/** True if a path of connections leads from `from` to a node of `kind`. */
function reaches(
  graph: Graph,
  out: Map<string, Set<string>>,
  from: string,
  kinds: ComponentKind[],
): boolean {
  const seen = new Set([from])
  const stack = [...(out.get(from) ?? [])]
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (seen.has(id)) continue
    seen.add(id)
    if (kinds.includes(graph.nodes[id].kind)) return true
    stack.push(...(out.get(id) ?? []))
  }
  return false
}

export function hasKind(
  kind: ComponentKind,
  text: string,
  why: string,
): RubricItem {
  return {
    id: `has-${kind}`,
    label: text,
    check: (graph) => {
      const found = nodesOf(graph, kind)
      return found.length > 0
        ? { pass: true, why: `${found[0].name} is on the board.` }
        : { pass: false, why }
    },
  }
}

/** A cache sits next to the database: it calls the database, or the same component calls both. */
export const cacheInFrontOfDatabase: RubricItem = {
  id: 'cache-before-db',
  label: 'Has a cache in front of the database',
  check: (graph) => {
    const caches = nodesOf(graph, 'cache')
    const databases = new Set(nodesOf(graph, 'database').map((n) => n.id))
    if (caches.length === 0) {
      return {
        pass: false,
        why: 'Add a cache so repeated reads skip the database.',
      }
    }
    if (databases.size === 0) {
      return {
        pass: false,
        why: 'Add a database for the cache to sit in front of.',
      }
    }
    const out = outgoing(graph)
    for (const cache of caches) {
      if ([...(out.get(cache.id) ?? [])].some((id) => databases.has(id))) {
        return {
          pass: true,
          why: `${cache.name} reads through to the database.`,
        }
      }
      for (const [from, targets] of out) {
        if (
          targets.has(cache.id) &&
          [...targets].some((id) => databases.has(id))
        ) {
          return {
            pass: true,
            why: `${graph.nodes[from].name} checks ${cache.name} before the database.`,
          }
        }
      }
    }
    return {
      pass: false,
      why: 'Connect the cache so it is checked before the database (the same service calls both, or the cache calls the database).',
    }
  },
}

export function databaseReplicas(min: number): RubricItem {
  return {
    id: `db-replicas-${min.toString()}`,
    label: `Database has at least ${min.toString()} replicas`,
    check: (graph) => {
      const databases = nodesOf(graph, 'database')
      if (databases.length === 0) {
        return { pass: false, why: 'There is no database yet.' }
      }
      const short = databases.filter(
        (db) => db.kind === 'database' && db.props.replicas < min,
      )
      return short.length === 0
        ? {
            pass: true,
            why: 'Losing one copy of the data does not take the app down.',
          }
        : {
            pass: false,
            why: `${short.map((db) => db.name).join(', ')}: set replicas to ${min.toString()} or more in its settings.`,
          }
    },
  }
}

/** Writes are buffered: some queue or pub/sub is fed by a component and leads on to a database. */
export const writesThroughQueue: RubricItem = {
  id: 'writes-through-queue',
  label: 'Writes go through a queue',
  check: (graph) => {
    const buffers = nodesOf(graph, 'queue', 'pubsub')
    if (buffers.length === 0) {
      return {
        pass: false,
        why: 'Add a queue or pub/sub to absorb write spikes.',
      }
    }
    const out = outgoing(graph)
    const fed = (id: string) =>
      [...out.values()].some((targets) => targets.has(id))
    const buffer = buffers.find(
      (b) => fed(b.id) && reaches(graph, out, b.id, ['database']),
    )
    return buffer
      ? { pass: true, why: `Writes reach the database through ${buffer.name}.` }
      : {
          pass: false,
          why: 'Connect something into the queue, and the queue on to a worker or the database.',
        }
  },
}

export const clientReachesDatabase: RubricItem = {
  id: 'client-to-db',
  label: 'A request can travel from the client to the data',
  check: (graph) => {
    const clients = nodesOf(graph, 'client')
    if (clients.length === 0)
      return { pass: false, why: 'Add a client where requests start.' }
    const out = outgoing(graph)
    const client = clients.find((c) => reaches(graph, out, c.id, ['database']))
    return client
      ? {
          pass: true,
          why: `${client.name} is connected all the way to a database.`,
        }
      : {
          pass: false,
          why: 'Connect the client through your services to a database.',
        }
  },
}

export const twoWayClient: RubricItem = {
  id: 'two-way-client',
  label: 'Clients keep a two-way connection',
  check: (graph) => {
    const clients = new Set(nodesOf(graph, 'client').map((n) => n.id))
    const edge = Object.values(graph.edges).find(
      (e) =>
        e.connection.kind === 'two-way' &&
        (clients.has(e.source) || clients.has(e.target)),
    )
    return edge
      ? {
          pass: true,
          why: 'The server can push new messages without the client asking.',
        }
      : {
          pass: false,
          why: 'Make the client connection two-way (like a WebSocket) so messages arrive instantly.',
        }
  },
}

export const servicesScaleOut: RubricItem = {
  id: 'services-scale-out',
  label: 'Services run more than one instance',
  check: (graph) => {
    const services = nodesOf(graph, 'service')
    if (services.length === 0)
      return { pass: false, why: 'Add a service for the app logic.' }
    const single = services.filter(
      (s) => s.kind === 'service' && s.props.instances < 2,
    )
    return single.length === 0
      ? { pass: true, why: 'One instance can fail without an outage.' }
      : {
          pass: false,
          why: `${single.map((s) => s.name).join(', ')}: set instances to 2 or more.`,
        }
  },
}
