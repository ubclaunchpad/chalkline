// Diagram checks: small pure rules over the derived graph. Each rule returns
// the problems it finds, named after components rather than ids.

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { CATALOG, type KindDefinition } from '../catalog/catalog.ts'
import type { Graph, GraphEdge, GraphNode } from '../graph/deriveGraph.ts'

export type Severity = 'error' | 'warning'

export interface Problem {
  /** Unique per problem, for React keys. */
  key: string
  elementId: string
  severity: Severity
  message: string
}

interface Context {
  graph: Graph
  byId: ReadonlyMap<string, ExcalidrawElement>
  edges: GraphEdge[]
}

type Rule = (context: Context) => Problem[]

/** The node with this id, or undefined (the Record type hides that case). */
export const nodeAt = (graph: Graph, id: string): GraphNode | undefined =>
  Object.hasOwn(graph.nodes, id) ? graph.nodes[id] : undefined

const nameOf = (graph: Graph, id: string) =>
  nodeAt(graph, id)?.name ?? 'A component'

/** Edges that touch the node, in either direction. */
const touching = (edges: GraphEdge[], id: string) =>
  edges.filter((edge) => edge.source === id || edge.target === id)

/** True when data can flow from `from` to `to` along this edge. */
const flowsInto = (edge: GraphEdge, to: string) =>
  edge.target === to ||
  (edge.connection.kind === 'two-way' && edge.source === to)

const unattachedArrows: Rule = ({ graph, byId }) => {
  const problems: Problem[] = []
  for (const { elementId } of graph.diagnostics) {
    const element = byId.get(elementId)
    if (element?.type !== 'arrow') continue
    const start = element.startBinding?.elementId
    const end = element.endBinding?.elementId
    const message =
      start !== undefined && nodeAt(graph, start)
        ? `The arrow from ${nameOf(graph, start)} isn't attached to anything at its other end.`
        : end !== undefined && nodeAt(graph, end)
          ? `The arrow into ${nameOf(graph, end)} isn't attached to anything at its start.`
          : 'This arrow is only attached at one end.'
    problems.push({
      key: `unattached:${elementId}`,
      elementId,
      severity: 'error',
      message,
    })
  }
  return problems
}

const brokenComponents: Rule = ({ graph, byId }) => {
  const reasons = new Map<string, string[]>()
  for (const { elementId, message } of graph.diagnostics) {
    if (byId.get(elementId)?.type === 'arrow') continue
    reasons.set(elementId, [...(reasons.get(elementId) ?? []), message])
  }
  return [...reasons].map(([elementId, messages]) => {
    const data = byId.get(elementId)?.customData
    const name =
      typeof data?.name === 'string' && data.name.trim() !== ''
        ? data.name
        : 'A component'
    return {
      key: `broken:${elementId}`,
      elementId,
      severity: 'error' as const,
      message: `${name} has settings Chalkline can't read (${messages.join('; ')}).`,
    }
  })
}

const unconnected: Rule = ({ graph, edges }) =>
  Object.values(graph.nodes)
    .filter((node) => touching(edges, node.id).length === 0)
    .map((node) => ({
      key: `unconnected:${node.id}`,
      elementId: node.id,
      severity: 'warning',
      message: `${node.name} has no connections.`,
    }))

const isPair = (graph: Graph, edge: GraphEdge, from: string, to: string) =>
  nodeAt(graph, edge.source)?.kind === from &&
  nodeAt(graph, edge.target)?.kind === to

const clientToDatabase: Rule = ({ graph, edges }) =>
  edges
    .filter(
      (edge) =>
        isPair(graph, edge, 'client', 'database') ||
        (edge.connection.kind === 'two-way' &&
          isPair(graph, edge, 'database', 'client')),
    )
    .map((edge) => {
      const [client, database] =
        nodeAt(graph, edge.source)?.kind === 'client'
          ? [edge.source, edge.target]
          : [edge.target, edge.source]
      return {
        key: `client-db:${edge.id}`,
        elementId: edge.id,
        severity: 'warning',
        message: `${nameOf(graph, client)} talks directly to ${nameOf(graph, database)}. This usually goes through an API.`,
      }
    })

const unreadDatabase: Rule = ({ graph, edges }) =>
  Object.values(graph.nodes)
    .filter((node) => node.kind === 'database')
    .filter((node) => {
      const linked = touching(edges, node.id)
      // No connections at all is already reported by `unconnected`.
      return (
        linked.length > 0 && !linked.some((edge) => flowsInto(edge, node.id))
      )
    })
    .map((node) => ({
      key: `unread-db:${node.id}`,
      elementId: node.id,
      severity: 'warning',
      message: `${node.name} has nothing reading from it.`,
    }))

const missingSettings: Rule = ({ graph }) =>
  Object.values(graph.nodes).flatMap((node: GraphNode) => {
    const settings: KindDefinition['settings'] = CATALOG[node.kind].settings
    return Object.entries(settings)
      .filter(([key, setting]) => {
        const value: unknown = (node.props as Record<string, unknown>)[key]
        return (
          setting.type === 'text' &&
          typeof value === 'string' &&
          value.trim() === ''
        )
      })
      .map(([key, setting]) => ({
        key: `missing:${node.id}:${key}`,
        elementId: node.id,
        severity: 'warning' as const,
        message: `${node.name} is missing its ${setting.label.toLowerCase()}.`,
      }))
  })

const asyncIntoClient: Rule = ({ graph, edges }) =>
  edges
    .filter(
      (edge) =>
        edge.connection.kind === 'async' &&
        nodeAt(graph, edge.target)?.kind === 'client',
    )
    .map((edge) => ({
      key: `async-client:${edge.id}`,
      elementId: edge.id,
      severity: 'warning',
      message: `${nameOf(graph, edge.source)} sends async messages straight to ${nameOf(graph, edge.target)}. Clients usually ask an API or keep a WebSocket open instead.`,
    }))

const selfLoops: Rule = ({ graph, edges }) =>
  edges
    .filter((edge) => edge.source === edge.target)
    .map((edge) => ({
      key: `self-loop:${edge.id}`,
      elementId: edge.id,
      severity: 'warning',
      message: `An arrow from ${nameOf(graph, edge.source)} loops back into itself.`,
    }))

const duplicateNames: Rule = ({ graph }) => {
  const byName = new Map<string, GraphNode[]>()
  for (const node of Object.values(graph.nodes)) {
    const key = node.name.trim().toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), node])
  }
  return [...byName.values()]
    .filter((nodes) => nodes.length > 1)
    .flatMap((nodes) =>
      nodes.map((node) => ({
        key: `duplicate:${node.id}`,
        elementId: node.id,
        severity: 'warning' as const,
        message: `${String(nodes.length)} components are called "${node.name}". Give each its own name so they're easy to tell apart.`,
      })),
    )
}

export const RULES: readonly Rule[] = [
  unattachedArrows,
  brokenComponents,
  unconnected,
  clientToDatabase,
  unreadDatabase,
  missingSettings,
  asyncIntoClient,
  selfLoops,
  duplicateNames,
]

export const CHECK_COUNT = RULES.length

/** Every problem on the board, errors first. */
export function runChecks(
  graph: Graph,
  elements: readonly ExcalidrawElement[],
): Problem[] {
  const context: Context = {
    graph,
    byId: new Map(elements.map((element) => [element.id, element])),
    edges: Object.values(graph.edges),
  }
  const problems = RULES.flatMap((rule) => rule(context))
  // Array sort is stable, so each rule's order survives within a severity.
  return problems.sort(
    (left, right) =>
      Number(right.severity === 'error') - Number(left.severity === 'error'),
  )
}
