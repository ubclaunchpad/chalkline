// Places a graph left to right in layers: sources on the left, each node one
// layer right of its furthest predecessor, layers ordered to cut crossings.
// Pure, so it works for templates, drafts and "Tidy up" alike.

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutOptions {
  /** Size of the largest node; every node gets a cell this big. */
  nodeWidth: number
  nodeHeight: number
  gapX?: number
  gapY?: number
}

export interface Point {
  x: number
  y: number
}

const SWEEPS = 4

/**
 * Returns each node's centre. The laid-out drawing's top-left corner is at
 * (0, 0). Unknown ids and self-loops in `edges` are ignored.
 */
export function layoutGraph(
  ids: readonly string[],
  edges: readonly LayoutEdge[],
  { nodeWidth, nodeHeight, gapX = 120, gapY = 60 }: LayoutOptions,
): Map<string, Point> {
  const known = new Set(ids)
  const links = edges.filter(
    (e) => e.source !== e.target && known.has(e.source) && known.has(e.target),
  )
  const stepX = nodeWidth + gapX
  const stepY = nodeHeight + gapY
  const positions = new Map<string, Point>()

  const parts = connectedParts(ids, links)
  const singles = parts.filter((p) => p.length === 1).flat()
  let top = 0
  let widestLayers = 1
  for (const part of parts) {
    if (part.length === 1) continue
    const inPart = new Set(part)
    const layers = orderLayers(
      part,
      links.filter((e) => inPart.has(e.source)),
    )
    const tallest = Math.max(...layers.map((l) => l.length))
    widestLayers = Math.max(widestLayers, layers.length)
    layers.forEach((layer, column) => {
      layer.forEach((id, row) => {
        positions.set(id, {
          x: column * stepX + nodeWidth / 2,
          y:
            top + (row + (tallest - layer.length) / 2) * stepY + nodeHeight / 2,
        })
      })
    })
    top += tallest * stepY
  }

  // Unconnected nodes go in a grid underneath.
  const columns = Math.max(widestLayers, Math.ceil(Math.sqrt(singles.length)))
  singles.forEach((id, i) => {
    positions.set(id, {
      x: (i % columns) * stepX + nodeWidth / 2,
      y: top + Math.floor(i / columns) * stepY + nodeHeight / 2,
    })
  })
  return positions
}

/** Weakly connected parts, each listed in input order. */
function connectedParts(
  ids: readonly string[],
  links: readonly LayoutEdge[],
): string[][] {
  const parent = new Map(ids.map((id) => [id, id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) ?? root
    parent.set(id, root)
    return root
  }
  for (const { source, target } of links) parent.set(find(source), find(target))
  const parts = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    const part = parts.get(root) ?? []
    part.push(id)
    parts.set(root, part)
  }
  return [...parts.values()]
}

/** Layers for one connected part, each ordered top to bottom. */
function orderLayers(ids: string[], links: readonly LayoutEdge[]): string[][] {
  const dag = removeCycles(ids, links)
  const preds = new Map(ids.map((id) => [id, [] as string[]]))
  const succs = new Map(ids.map((id) => [id, [] as string[]]))
  for (const { source, target } of dag) {
    preds.get(target)?.push(source)
    succs.get(source)?.push(target)
  }

  // Longest-path layering in topological order.
  const layerOf = new Map<string, number>()
  const waiting = new Map(ids.map((id) => [id, preds.get(id)?.length ?? 0]))
  const ready = ids.filter((id) => waiting.get(id) === 0)
  for (let id = ready.shift(); id !== undefined; id = ready.shift()) {
    const layer = Math.max(
      0,
      ...(preds.get(id) ?? []).map((p) => (layerOf.get(p) ?? 0) + 1),
    )
    layerOf.set(id, layer)
    for (const next of succs.get(id) ?? []) {
      const left = (waiting.get(next) ?? 0) - 1
      waiting.set(next, left)
      if (left === 0) ready.push(next)
    }
  }

  const layers: string[][] = []
  for (const id of ids) {
    const layer = layerOf.get(id) ?? 0
    ;(layers[layer] ??= []).push(id)
  }

  // Barycenter sweeps: sort each layer by the average row of its neighbours
  // on the side already placed (left going down, right coming back).
  const rowOf = new Map<string, number>()
  const remember = (layer: string[]) => {
    layer.forEach((id, row) => rowOf.set(id, row - (layer.length - 1) / 2))
  }
  layers.forEach(remember)
  const sortBy = (layer: string[], neighbours: Map<string, string[]>) => {
    const score = new Map(
      layer.map((id) => {
        const rows = (neighbours.get(id) ?? []).map((n) => rowOf.get(n) ?? 0)
        const mean = rows.reduce((sum, r) => sum + r, 0) / rows.length
        return [id, rows.length > 0 ? mean : (rowOf.get(id) ?? 0)]
      }),
    )
    layer.sort((a, b) => (score.get(a) ?? 0) - (score.get(b) ?? 0))
    remember(layer)
  }
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let i = 1; i < layers.length; i++) sortBy(layers[i], preds)
    for (let i = layers.length - 2; i >= 0; i--) sortBy(layers[i], succs)
  }
  return layers
}

/** Reverses back edges found by depth-first search, so the graph is acyclic. */
function removeCycles(
  ids: string[],
  links: readonly LayoutEdge[],
): LayoutEdge[] {
  const out = new Map(ids.map((id) => [id, [] as LayoutEdge[]]))
  for (const link of links) out.get(link.source)?.push(link)
  const hasIncoming = new Set(links.map((e) => e.target))
  // Start from sources so they stay on the left.
  const starts = [
    ...ids.filter((id) => !hasIncoming.has(id)),
    ...ids.filter((id) => hasIncoming.has(id)),
  ]
  const state = new Map<string, 'open' | 'done'>()
  const result: LayoutEdge[] = []
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const link of out.get(id) ?? []) {
      const seen = state.get(link.target)
      if (seen === 'open') {
        result.push({ source: link.target, target: link.source })
        continue
      }
      result.push(link)
      if (seen === undefined) visit(link.target)
    }
    state.set(id, 'done')
  }
  for (const id of starts) if (!state.has(id)) visit(id)
  return result
}
