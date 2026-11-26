// Derives the architecture graph from an Excalidraw scene. Elements with valid
// component customData become nodes, and arrows bound to two nodes become
// directed edges from their start to their end. The function is pure: the
// scene stays the only board document and the graph is rebuilt on demand.

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { validateComponent } from '../catalog/validate.ts'

export type GraphNode = ComponentData & { id: string }

export type ConnectionKind = 'call' | 'async' | 'two-way'

export interface Connection {
  kind: ConnectionKind
  label?: string
  props?: Record<string, string | number | boolean>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  /** What the arrow means. Plain arrows are a `call`. */
  connection: Connection
}

const CONNECTION_KINDS: readonly string[] = ['call', 'async', 'two-way']

/** True for prototype annotations (groups, notes, comments, connections). */
export function isAnnotation(customData: unknown): boolean {
  return (
    typeof customData === 'object' &&
    customData !== null &&
    'annotation' in customData
  )
}

function readConnection(customData: unknown): Connection {
  if (typeof customData !== 'object' || customData === null) {
    return { kind: 'call' }
  }
  const data = customData as Record<string, unknown>
  if (data.annotation !== 'connection') return { kind: 'call' }
  const kind =
    typeof data.kind === 'string' && CONNECTION_KINDS.includes(data.kind)
      ? (data.kind as ConnectionKind)
      : 'call'
  const connection: Connection = { kind }
  if (typeof data.label === 'string' && data.label !== '') {
    connection.label = data.label
  }
  if (typeof data.props === 'object' && data.props !== null) {
    connection.props = data.props as Connection['props']
  }
  return connection
}

// Explains why an element was left out of the graph.
export interface Diagnostic {
  elementId: string
  message: string
}

export interface Graph {
  nodes: Record<string, GraphNode>
  edges: Record<string, GraphEdge>
  diagnostics: Diagnostic[]
}

const START_PROBLEM = 'arrow start is not connected to a valid component'
const END_PROBLEM = 'arrow end is not connected to a valid component'

// Plain comparison rather than localeCompare, which can differ between
// machines and would make the output depend on the user's locale.
const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

export function deriveGraph(elements: readonly ExcalidrawElement[]): Graph {
  // Sorting by id makes nodes, edges, and diagnostics independent of the
  // scene's element order.
  const live = elements
    .filter((element) => !element.isDeleted)
    .sort((left, right) => compareIds(left.id, right.id))

  const nodes: Record<string, GraphNode> = {}
  const edges: Record<string, GraphEdge> = {}
  const diagnostics: Diagnostic[] = []

  for (const element of live) {
    // Plain shapes and freehand drawings have no customData.
    if (element.customData === undefined || isAnnotation(element.customData)) {
      continue
    }
    const result = validateComponent(element.customData)
    if (result.ok) {
      nodes[element.id] = { ...result.data, id: element.id }
    } else {
      for (const message of result.problems) {
        diagnostics.push({ elementId: element.id, message })
      }
    }
  }

  for (const element of live) {
    if (element.type !== 'arrow') {
      continue
    }
    // Deleted, missing, plain, and malformed endpoints are all absent from
    // nodes, so one lookup covers every way an end can be invalid.
    const source = element.startBinding?.elementId
    const target = element.endBinding?.elementId
    const hasSource = source !== undefined && Object.hasOwn(nodes, source)
    const hasTarget = target !== undefined && Object.hasOwn(nodes, target)

    if (hasSource && hasTarget) {
      edges[element.id] = {
        id: element.id,
        source,
        target,
        connection: readConnection(element.customData),
      }
    } else if (hasSource) {
      diagnostics.push({ elementId: element.id, message: END_PROBLEM })
    } else if (hasTarget) {
      diagnostics.push({ elementId: element.id, message: START_PROBLEM })
    }
    // An arrow with no valid end is just a drawing, so it is ignored.
  }

  return { nodes, edges, diagnostics }
}
