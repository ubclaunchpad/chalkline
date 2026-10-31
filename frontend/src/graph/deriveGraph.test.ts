import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawRectangleElement,
} from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import { deriveGraph } from './deriveGraph.ts'

// Builders modelled on a real exported Excalidraw scene: arrows reference the
// container shape through startBinding/endBinding, and plain shapes have no
// customData key at all.

interface ElementOptions {
  isDeleted?: boolean
}

const baseElement = (id: string, { isDeleted = false }: ElementOptions) =>
  ({
    id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roundness: null,
    roughness: 1,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  }) as const

const rectangle = (
  id: string,
  options: ElementOptions & { customData?: Record<string, unknown> } = {},
): ExcalidrawRectangleElement => ({
  ...baseElement(id, options),
  type: 'rectangle',
  ...(options.customData && { customData: options.customData }),
})

const binding = (elementId: string | undefined) =>
  elementId === undefined ? null : { elementId, focus: 0, gap: 1 }

const arrow = (
  id: string,
  options: ElementOptions & { start?: string; end?: string } = {},
): ExcalidrawArrowElement => ({
  ...baseElement(id, options),
  type: 'arrow',
  points: [
    [0, 0],
    [100, 0],
  ],
  lastCommittedPoint: null,
  startBinding: binding(options.start),
  endBinding: binding(options.end),
  startArrowhead: null,
  endArrowhead: 'arrow',
  elbowed: false,
})

const freedraw = (id: string): ExcalidrawFreeDrawElement => ({
  ...baseElement(id, {}),
  type: 'freedraw',
  points: [
    [0, 0],
    [10, 10],
  ],
  pressures: [],
  simulatePressure: true,
  lastCommittedPoint: null,
})

const serviceData = {
  v: 1,
  kind: 'service',
  name: 'API',
  props: { instances: 1, protocol: 'HTTP' },
} as const

const databaseData = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
} as const

const service = (id: string, options: ElementOptions = {}) =>
  rectangle(id, { ...options, customData: serviceData })

const database = (id: string, options: ElementOptions = {}) =>
  rectangle(id, { ...options, customData: databaseData })

const emptyGraph = { nodes: {}, edges: {}, diagnostics: [] }

const START_PROBLEM = 'arrow start is not connected to a valid component'
const END_PROBLEM = 'arrow end is not connected to a valid component'

describe('deriveGraph', () => {
  it('connects two components with a directed edge', () => {
    const scene: ExcalidrawElement[] = [
      service('api'),
      database('db'),
      arrow('a1', { start: 'api', end: 'db' }),
    ]

    expect(deriveGraph(scene)).toEqual({
      nodes: {
        api: { id: 'api', ...serviceData },
        db: { id: 'db', ...databaseData },
      },
      edges: { a1: { id: 'a1', source: 'api', target: 'db' } },
      diagnostics: [],
    })
  })

  it('follows the arrow direction when it is reversed', () => {
    const scene = [
      service('api'),
      database('db'),
      arrow('a1', { start: 'db', end: 'api' }),
    ]

    expect(deriveGraph(scene).edges).toEqual({
      a1: { id: 'a1', source: 'db', target: 'api' },
    })
  })

  it('ignores plain shapes', () => {
    expect(deriveGraph([rectangle('box')])).toEqual(emptyGraph)
  })

  it('ignores freehand drawings', () => {
    expect(deriveGraph([freedraw('scribble')])).toEqual(emptyGraph)
  })

  it('ignores deleted components', () => {
    expect(deriveGraph([database('db', { isDeleted: true })])).toEqual(
      emptyGraph,
    )
  })

  it('ignores deleted arrows', () => {
    const scene = [
      service('api'),
      database('db'),
      arrow('a1', { start: 'api', end: 'db', isDeleted: true }),
    ]

    expect(deriveGraph(scene).edges).toEqual({})
    expect(deriveGraph(scene).diagnostics).toEqual([])
  })

  it('ignores arrows that are not bound at either end', () => {
    expect(deriveGraph([arrow('a1')])).toEqual(emptyGraph)
  })
})

describe('dangling arrows', () => {
  it('reports an arrow with an unbound end', () => {
    const graph = deriveGraph([service('api'), arrow('a1', { start: 'api' })])

    expect(graph.edges).toEqual({})
    expect(graph.diagnostics).toEqual([
      { elementId: 'a1', message: END_PROBLEM },
    ])
  })

  it('reports an arrow bound to a deleted component', () => {
    const graph = deriveGraph([
      service('api'),
      database('db', { isDeleted: true }),
      arrow('a1', { start: 'api', end: 'db' }),
    ])

    expect(graph.edges).toEqual({})
    expect(graph.diagnostics).toEqual([
      { elementId: 'a1', message: END_PROBLEM },
    ])
  })

  it('reports an arrow bound to an element that does not exist', () => {
    const graph = deriveGraph([
      service('api'),
      arrow('a1', { start: 'api', end: 'missing' }),
    ])

    expect(graph.edges).toEqual({})
    expect(graph.diagnostics).toEqual([
      { elementId: 'a1', message: END_PROBLEM },
    ])
  })

  it('reports an arrow bound to a plain shape', () => {
    const graph = deriveGraph([
      rectangle('box'),
      database('db'),
      arrow('a1', { start: 'box', end: 'db' }),
    ])

    expect(graph.edges).toEqual({})
    expect(graph.diagnostics).toEqual([
      { elementId: 'a1', message: START_PROBLEM },
    ])
  })
})

describe('malformed components', () => {
  it('reports validator problems without throwing', () => {
    const broken = rectangle('db', {
      customData: { ...databaseData, props: { engine: 'Oracle', replicas: 0 } },
    })

    expect(() => deriveGraph([broken])).not.toThrow()
    expect(deriveGraph([broken])).toEqual({
      nodes: {},
      edges: {},
      diagnostics: [
        {
          elementId: 'db',
          message:
            'engine must be one of: PostgreSQL, MySQL, MongoDB, DynamoDB',
        },
        { elementId: 'db', message: 'replicas must be at least 1' },
      ],
    })
  })
})

describe('determinism', () => {
  it('returns the same graph for any element order', () => {
    const scene = [
      service('api'),
      database('db'),
      rectangle('bad', { customData: { v: 1, kind: 'blockchain' } }),
      arrow('a1', { start: 'api', end: 'db' }),
      arrow('a2', { start: 'api' }),
      arrow('a3', { end: 'db' }),
    ]
    const expected = JSON.stringify(deriveGraph(scene))

    // JSON.stringify also compares key order, which a plain toEqual ignores.
    expect(JSON.stringify(deriveGraph([...scene].reverse()))).toBe(expected)
    expect(
      JSON.stringify(deriveGraph([...scene.slice(3), ...scene.slice(0, 3)])),
    ).toBe(expected)
  })
})
