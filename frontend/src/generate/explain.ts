// Plain-language description of a board, built from its graph.
import { CATALOG, type ComponentKind } from '../catalog/catalog'
import type { Graph, GraphEdge, GraphNode } from '../graph/deriveGraph'

export const STORE_KINDS: readonly ComponentKind[] = [
  'database',
  'cache',
  'object_storage',
]
export const MESSAGING_KINDS: readonly ComponentKind[] = ['queue', 'pubsub']
const MAX_PATHS = 3
// Bounds the path search on big, dense boards.
const MAX_PATH_STEPS = 5000

/** "A", "A and B", "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const count = (n: number, word: string) =>
  `${String(n)} ${word}${n === 1 ? '' : 's'}`

/** Edges leaving and entering each node. */
export function adjacency(graph: Graph) {
  const out = new Map<string, GraphEdge[]>()
  const into = new Map<string, GraphEdge[]>()
  for (const edge of Object.values(graph.edges)) {
    out.set(edge.source, [...(out.get(edge.source) ?? []), edge])
    into.set(edge.target, [...(into.get(edge.target) ?? []), edge])
  }
  return { out, into }
}

/** Longest chain of synchronous calls starting at `start`. */
function longestCallPath(
  start: string,
  out: Map<string, GraphEdge[]>,
): string[] {
  let best: string[] = [start]
  let steps = 0
  const walk = (path: string[]) => {
    if (++steps > MAX_PATH_STEPS) return
    if (path.length > best.length) best = path
    for (const edge of out.get(path[path.length - 1]) ?? []) {
      if (edge.connection.kind === 'async' || path.includes(edge.target))
        continue
      walk([...path, edge.target])
    }
  }
  walk([start])
  return best
}

function storeDetail(node: GraphNode): string {
  const props = node.props as Record<string, unknown>
  const engine = props.engine ?? props.provider
  return typeof engine === 'string'
    ? engine
    : CATALOG[node.kind].label.toLowerCase()
}

/** A few sentences that walk through the diagram. */
export function explainGraph(graph: Graph): string[] {
  const nodes = Object.values(graph.nodes)
  if (nodes.length === 0) {
    return [
      'The board has no components yet. Pick a template, draft one from a description, or add components from the panel.',
    ]
  }
  const edges = Object.values(graph.edges)
  const { out, into } = adjacency(graph)
  const name = (id: string) => graph.nodes[id].name
  const lines = [
    `The board has ${count(nodes.length, 'component')} and ${count(edges.length, 'connection')}.`,
  ]

  const linked = nodes.filter((n) => out.has(n.id) || into.has(n.id))
  const entries = linked.filter((n) => !into.has(n.id))
  if (entries.length > 0) {
    lines.push(`Requests start at ${listNames(entries.map((n) => n.name))}.`)
  } else if (linked.length > 0) {
    lines.push(
      'Every connected component is called by something else, so there is no clear starting point.',
    )
  }
  for (const entry of entries.slice(0, MAX_PATHS)) {
    const path = longestCallPath(entry.id, out)
    if (path.length > 1) {
      lines.push(`Request path: ${path.map(name).join(' → ')}.`)
    }
  }

  const stores = nodes.filter((n) => STORE_KINDS.includes(n.kind))
  if (stores.length > 0) {
    const described = stores.map((store) => {
      const users = (into.get(store.id) ?? []).map((e) => name(e.source))
      const usedBy = users.length > 0 ? `, used by ${listNames(users)}` : ''
      return `${store.name} (${storeDetail(store)}${usedBy})`
    })
    lines.push(`Data is kept in ${listNames(described)}.`)
  }

  for (const hub of nodes.filter((n) => MESSAGING_KINDS.includes(n.kind))) {
    const producers = (into.get(hub.id) ?? []).map((e) => name(e.source))
    const consumers = (out.get(hub.id) ?? []).map((e) => name(e.target))
    lines.push(
      `${hub.name} carries messages in the background from ${listNames(producers) || 'nothing yet'} to ${listNames(consumers) || 'nothing yet'}.`,
    )
  }
  for (const edge of edges) {
    const touchesHub = [edge.source, edge.target].some((id) =>
      MESSAGING_KINDS.includes(graph.nodes[id].kind),
    )
    if (edge.connection.kind === 'async' && !touchesHub) {
      lines.push(
        `${name(edge.source)} → ${name(edge.target)} happens in the background${edge.connection.label ? ` (${edge.connection.label})` : ''}.`,
      )
    }
  }

  const lone = nodes.filter((n) => !out.has(n.id) && !into.has(n.id))
  if (lone.length > 0) {
    lines.push(
      `Not connected to anything yet: ${listNames(lone.map((n) => n.name))}.`,
    )
  }
  return lines
}
