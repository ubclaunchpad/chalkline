import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  isComponentData,
  KIND_DEFS,
  type ComponentData,
  type Kind,
} from './catalog'
import { iconOwner } from './elements'

export type GraphNode = {
  id: string
  kind: Kind
  name: string
  props: ComponentData['props']
}
export type GraphEdge = { id: string; from: string; to: string }
export type Graph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  danglingArrows: string[]
}

/** Derive the architecture graph from canvas elements and arrow bindings. */
export function deriveGraph(elements: readonly ExcalidrawElement[]): Graph {
  const nodes: GraphNode[] = []
  for (const e of elements) {
    if (e.isDeleted || !isComponentData(e.customData)) continue
    const { kind, name, props } = e.customData
    nodes.push({ id: e.id, kind, name, props })
  }
  const nodeIds = new Set(nodes.map((n) => n.id))
  // An arrow that snapped to a component's icon still connects the component.
  const owners = new Map<string, string>()
  for (const e of elements) {
    const owner = iconOwner(e)
    if (owner) owners.set(e.id, owner)
  }
  const resolve = (id: string | undefined) => (id && owners.get(id)) ?? id

  const edges: GraphEdge[] = []
  const danglingArrows: string[] = []
  for (const e of elements) {
    if (e.isDeleted || e.type !== 'arrow') continue
    const from = resolve(e.startBinding?.elementId)
    const to = resolve(e.endBinding?.elementId)
    if (from && to && nodeIds.has(from) && nodeIds.has(to))
      edges.push({ id: e.id, from, to })
    else danglingArrows.push(e.id)
  }
  return { nodes, edges, danglingArrows }
}

export type Finding = {
  id: string
  severity: 'warning' | 'info'
  title: string
  detail: string
  elementIds: string[]
}

/** Placeholder structural rules, meant to show the feedback UX. */
export function reviewGraph(graph: Graph): Finding[] {
  const findings: Finding[] = []
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const outgoing = (id: string) => graph.edges.filter((e) => e.from === id)
  const degree = (id: string) =>
    graph.edges.filter((e) => e.from === id || e.to === id).length

  for (const node of graph.nodes) {
    if (degree(node.id) === 0) {
      findings.push({
        id: `isolated-${node.id}`,
        severity: 'warning',
        title: `${node.name} isn't connected`,
        detail: 'Draw an arrow to show what talks to it, or remove it.',
        elementIds: [node.id],
      })
    }
    if (node.kind === 'database' && Number(node.props.replicas) <= 1) {
      findings.push({
        id: `spof-${node.id}`,
        severity: 'info',
        title: `${node.name} has a single replica`,
        detail:
          'If this machine fails, every write fails with it. Consider a replica for failover.',
        elementIds: [node.id],
      })
    }
    if (node.kind === 'load_balancer' && outgoing(node.id).length < 2) {
      findings.push({
        id: `lb-${node.id}`,
        severity: 'info',
        title: `${node.name} has fewer than two targets`,
        detail:
          'A load balancer only helps when it can spread traffic across instances.',
        elementIds: [node.id],
      })
    }
    if (
      node.kind === 'cache' &&
      degree(node.id) > 0 &&
      outgoing(node.id).length === 0
    ) {
      const readers = graph.edges
        .filter((e) => e.to === node.id)
        .map((e) => byId.get(e.from)?.kind)
      if (!readers.includes('service')) continue
      findings.push({
        id: `cache-${node.id}`,
        severity: 'info',
        title: `Where do ${node.name} misses go?`,
        detail:
          'Make sure the service that reads the cache also reaches the source of truth.',
        elementIds: [node.id],
      })
    }
  }

  for (const edge of graph.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from?.kind === 'client' && to?.kind === 'database') {
      findings.push({
        id: `client-db-${edge.id}`,
        severity: 'warning',
        title: `${from.name} talks to ${to.name} directly`,
        detail:
          'Clients usually reach data through a service that handles auth and validation.',
        elementIds: [edge.id, from.id, to.id],
      })
    }
  }

  if (graph.danglingArrows.length > 0) {
    findings.push({
      id: 'dangling',
      severity: 'info',
      title: `${graph.danglingArrows.length} arrow${graph.danglingArrows.length > 1 ? 's' : ''} not connected at both ends`,
      detail: 'Only arrows attached to two components count as connections.',
      elementIds: graph.danglingArrows,
    })
  }
  return findings
}

export function kindLabel(kind: Kind): string {
  return KIND_DEFS[kind].label
}
