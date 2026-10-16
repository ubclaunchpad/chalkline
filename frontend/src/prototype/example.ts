import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { defaultProps, type ComponentData, type Kind } from './catalog'
import {
  COMPONENT_HEIGHT,
  COMPONENT_WIDTH,
  componentSkeletons,
  groupLabels,
} from './elements'

type Spec = {
  id: string
  kind: Kind
  name: string
  col: number
  row: number
  props?: ComponentData['props']
}

// A small URL-shortener design with a couple of deliberate weak spots, so the
// review panel has something to say.
const NODES: Spec[] = [
  { id: 'ex-client', kind: 'client', name: 'Web app', col: 0, row: 1 },
  { id: 'ex-lb', kind: 'load_balancer', name: 'Load balancer', col: 1, row: 1 },
  { id: 'ex-api-a', kind: 'service', name: 'Shortener API', col: 2, row: 0 },
  { id: 'ex-api-b', kind: 'service', name: 'Redirect API', col: 2, row: 2 },
  { id: 'ex-cache', kind: 'cache', name: 'Hot links', col: 3, row: 2 },
  { id: 'ex-db', kind: 'database', name: 'Links DB', col: 3, row: 0 },
  { id: 'ex-queue', kind: 'queue', name: 'Click events', col: 3, row: 1 },
  {
    id: 'ex-s3',
    kind: 'object_storage',
    name: 'Exports',
    col: 4,
    row: 1,
    props: { bucket: 'csv-exports' },
  },
]

const EDGES: [string, string][] = [
  ['ex-client', 'ex-lb'],
  ['ex-lb', 'ex-api-a'],
  ['ex-lb', 'ex-api-b'],
  ['ex-api-a', 'ex-db'],
  ['ex-api-b', 'ex-cache'],
  ['ex-api-b', 'ex-queue'],
]

export function exampleElements() {
  const colGap = COMPONENT_WIDTH + 90
  const rowGap = COMPONENT_HEIGHT + 80
  const pos = new Map(
    NODES.map((n) => [n.id, { x: n.col * colGap, y: n.row * rowGap }]),
  )
  const elements = convertToExcalidrawElements(
    [
      ...NODES.flatMap((n) =>
        componentSkeletons(
          {
            v: 1,
            kind: n.kind,
            name: n.name,
            props: { ...defaultProps(n.kind), ...n.props },
          },
          { id: n.id, ...pos.get(n.id)! },
        ),
      ),
      ...EDGES.map(([from, to]) => {
        // Skeleton arrows keep their bindings but not their geometry, so
        // route each one from the source's right edge to the target's left.
        const a = pos.get(from)!
        const b = pos.get(to)!
        const x = a.x + COMPONENT_WIDTH + 6
        const y = a.y + COMPONENT_HEIGHT / 2
        const dx = b.x - 6 - x
        const dy = b.y + COMPONENT_HEIGHT / 2 - y
        return {
          type: 'arrow' as const,
          x,
          y,
          width: Math.abs(dx),
          height: Math.abs(dy),
          points: [
            [0, 0],
            [dx, dy],
          ] as [number, number][],
          strokeColor: '#495057',
          start: { id: from },
          end: { id: to },
        }
      }),
    ],
    { regenerateIds: false },
  )
  return groupLabels(elements)
}
