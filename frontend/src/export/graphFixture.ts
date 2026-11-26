// Test helper: builds a Graph by hand, with catalog defaults for props.
import type { ComponentKind } from '../catalog/catalog'
import { validateComponent } from '../catalog/validate'
import type { ConnectionKind, Graph } from '../graph/deriveGraph'
import { catalog } from '../sidebar/catalog'

export function graphOf(
  nodes: [
    id: string,
    kind: ComponentKind,
    name: string,
    props?: Record<string, unknown>,
  ][],
  edges: [
    source: string,
    target: string,
    kind?: ConnectionKind,
    label?: string,
  ][] = [],
): Graph {
  const graph: Graph = { nodes: {}, edges: {}, diagnostics: [] }
  for (const [id, kind, name, props] of nodes) {
    const defaults = catalog.find((entry) => entry.kind === kind)?.defaultProps
    const result = validateComponent({
      v: 1,
      kind,
      name,
      props: { ...defaults, ...props },
    })
    if (!result.ok) throw new Error(result.problems.join('; '))
    graph.nodes[id] = { ...result.data, id }
  }
  edges.forEach(([source, target, kind = 'call', label], index) => {
    const id = `e${index.toString()}`
    graph.edges[id] = {
      id,
      source,
      target,
      connection: label ? { kind, label } : { kind },
    }
  })
  return graph
}
