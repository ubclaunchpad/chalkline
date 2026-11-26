// Turns the architecture graph into a Mermaid flowchart that can be pasted
// into a GitHub README. Pure: the same graph always gives the same text.

import type { ComponentKind } from '../catalog/catalog'
import type { ConnectionKind, Graph } from '../graph/deriveGraph'

// Opening and closing brackets for each shape. Unlisted kinds are rectangles.
const SHAPES: Partial<Record<ComponentKind, [string, string]>> = {
  client: ['([', '])'], // stadium
  database: ['[(', ')]'], // cylinder
  cache: ['[(', ')]'],
  object_storage: ['[(', ')]'],
  queue: ['[[', ']]'], // subroutine
  pubsub: ['>', ']'], // flag
  load_balancer: ['{{', '}}'], // hexagon
  api_gateway: ['{{', '}}'],
  cdn: ['((', '))'], // circle
  serverless_function: ['(', ')'], // rounded
  external_service: ['[/', '/]'], // parallelogram
}

const ARROWS: Record<ConnectionKind, string> = {
  call: '-->',
  async: '-.->',
  'two-way': '<-->',
}

/**
 * Makes user text safe inside a quoted Mermaid label. Mermaid has no
 * backslash escapes, so special characters become its `#code;` entities.
 */
export function mermaidText(text: string): string {
  return text
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/`/g, '#96;')
    .replace(/\|/g, '#124;')
    .replace(/\s+/g, ' ')
    .trim()
}

export function toMermaid(graph: Graph): string {
  const lines = ['flowchart LR']
  // Excalidraw ids can contain characters Mermaid reads as syntax, so nodes
  // get short generated ids in the graph's (sorted) order.
  const ids = new Map<string, string>()
  for (const node of Object.values(graph.nodes)) {
    const id = `n${(ids.size + 1).toString()}`
    ids.set(node.id, id)
    const [open, close] = SHAPES[node.kind] ?? ['[', ']']
    const name = mermaidText(node.name) || node.kind
    lines.push(`  ${id}${open}"${name}"${close}`)
  }
  for (const edge of Object.values(graph.edges)) {
    const source = ids.get(edge.source)
    const target = ids.get(edge.target)
    if (!source || !target) continue
    const label = edge.connection.label
      ? mermaidText(edge.connection.label)
      : ''
    const arrow = ARROWS[edge.connection.kind]
    lines.push(
      label
        ? `  ${source} ${arrow}|"${label}"| ${target}`
        : `  ${source} ${arrow} ${target}`,
    )
  }
  return `${lines.join('\n')}\n`
}
