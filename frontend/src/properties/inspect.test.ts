import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it, vi } from 'vitest'
import {
  currentSize,
  deleteElements,
  inspectTarget,
  readConnection,
  resizeAroundCentre,
  setAccent,
  SIZES,
  updateConnection,
  updateGroup,
  type ConnectionData,
} from './inspect.ts'
import { readNotes, updateComponent } from './updateComponent.ts'
import { canvasColor } from '../design/canvasColor'

// The real package needs a browser canvas to load. This stand-in copies the
// element, applies the updates and bumps the version, like the real one.
vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: (element: ExcalidrawElement, updates: object) => ({
    ...element,
    ...updates,
    version: element.version + 1,
  }),
}))

const database = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}
const cache = {
  v: 1,
  kind: 'cache',
  name: 'Sessions',
  props: { engine: 'Redis', strategy: 'Cache-aside', ttlSeconds: 300 },
}

// Builds a loose element; tests only read the fields they set.
function el(fields: Record<string, unknown>): ExcalidrawElement {
  return {
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0,
    strokeColor: '#1e1e1e',
    version: 1,
    isDeleted: false,
    boundElements: null,
    ...fields,
  } as unknown as ExcalidrawElement
}

const db = el({ id: 'db', customData: database })
const kv = el({ id: 'kv', x: 300, customData: cache })
const plainArrow = el({
  id: 'arrow',
  type: 'arrow',
  startBinding: { elementId: 'db' },
  endBinding: { elementId: 'kv' },
  points: [
    [0, 0],
    [200, 0],
  ],
})
const group = el({
  id: 'vpc',
  customData: { v: 1, annotation: 'group', kind: 'cluster', name: 'Prod' },
})
const scene = [db, kv, plainArrow, group]

describe('inspectTarget', () => {
  it('finds a single component, connection or group', () => {
    expect(inspectTarget(scene, ['db'])).toMatchObject({
      type: 'component',
      data: database,
    })
    expect(inspectTarget(scene, ['arrow'])).toMatchObject({
      type: 'connection',
      data: { annotation: 'connection', kind: 'call' },
    })
    expect(inspectTarget(scene, ['vpc'])).toMatchObject({
      type: 'group',
      data: { kind: 'cluster', name: 'Prod' },
    })
  })

  it('returns null for nothing, a plain shape or a deleted element', () => {
    expect(inspectTarget(scene, [])).toBeNull()
    expect(inspectTarget([el({ id: 'box' })], ['box'])).toBeNull()
    expect(
      inspectTarget(
        [el({ id: 'db', customData: database, isDeleted: true })],
        ['db'],
      ),
    ).toBeNull()
  })

  it('summarises several selected items, ignoring labels inside cards', () => {
    const label = el({ id: 'label', type: 'text', containerId: 'db' })
    const target = inspectTarget(
      [...scene, label, el({ id: 'box' })],
      ['db', 'kv', 'arrow', 'label', 'box'],
    )
    expect(target).toMatchObject({
      type: 'many',
      summary: '2 components, 1 connection, 1 other shape',
    })
  })
})

describe('readConnection', () => {
  it('ignores an unannotated arrow that is not between two components', () => {
    const loose = el({ id: 'a', type: 'arrow', startBinding: null })
    expect(readConnection(loose, scene)).toBeNull()
  })

  it('ignores arrows with another annotation', () => {
    const other = el({
      id: 'a',
      type: 'arrow',
      customData: { v: 1, annotation: 'sticky' },
    })
    expect(readConnection(other, scene)).toBeNull()
  })

  it('reads kind, label and props, defaulting an unknown kind to call', () => {
    const arrow = el({
      id: 'a',
      type: 'arrow',
      customData: {
        v: 1,
        annotation: 'connection',
        kind: 'teleport',
        label: 'orders',
        props: { protocol: 'gRPC' },
      },
    })
    expect(readConnection(arrow, [])).toEqual({
      v: 1,
      annotation: 'connection',
      kind: 'call',
      label: 'orders',
      props: { protocol: 'gRPC' },
    })
  })
})

describe('updateConnection', () => {
  const current: ConnectionData = {
    v: 1,
    annotation: 'connection',
    kind: 'call',
  }

  it('creates connection data on a plain arrow', () => {
    const result = updateConnection(plainArrow, current, {
      kind: 'async',
      label: ' orders.created ',
      protocol: 'Kafka',
    })
    expect(result.ok && result.element.customData).toEqual({
      v: 1,
      annotation: 'connection',
      kind: 'async',
      label: 'orders.created',
      props: { protocol: 'Kafka' },
    })
  })

  it('removes an emptied label and a cleared protocol', () => {
    const arrow = el({
      type: 'arrow',
      customData: {
        ...current,
        label: 'x',
        props: { protocol: 'HTTP' },
        extra: 1,
      },
    })
    const data = readConnection(arrow, [])
    if (!data) throw new Error('expected connection data')
    const result = updateConnection(arrow, data, { label: '', protocol: '' })
    expect(result.ok && result.element.customData).toEqual({
      ...current,
      extra: 1,
    })
  })

  it('returns the same element when nothing changed', () => {
    const arrow = el({ type: 'arrow', customData: current })
    const result = updateConnection(arrow, current, { kind: 'call' })
    expect(result.ok && result.element).toBe(arrow)
  })

  it('rejects bad input and changes nothing', () => {
    expect(
      updateConnection(plainArrow, current, {
        kind: 'teleport',
        label: 'x'.repeat(61),
        protocol: 'FTP',
      }),
    ).toEqual({
      ok: false,
      problems: [
        'kind must be Call, Async or Two-way',
        'label must be at most 60 characters',
        'protocol must be one of: HTTP, gRPC, WebSocket, SQL, TCP, Kafka, AMQP, Other',
      ],
    })
  })
})

describe('updateGroup', () => {
  it('renames and changes kind, keeping other fields', () => {
    const result = updateGroup(group, { name: 'Staging', kind: 'region' })
    expect(result.ok && result.element.customData).toEqual({
      v: 1,
      annotation: 'group',
      kind: 'region',
      name: 'Staging',
    })
  })

  it('rejects an empty name, an unknown kind and a non-group', () => {
    expect(updateGroup(group, { name: ' ' })).toEqual({
      ok: false,
      problems: ['name is required'],
    })
    expect(updateGroup(group, { kind: 'galaxy' }).ok).toBe(false)
    expect(updateGroup(db, { name: 'x' })).toEqual({
      ok: false,
      problems: ['element is not a group'],
    })
  })
})

describe('component notes', () => {
  it('stores notes beside the component data and keeps them on rename', () => {
    const noted = updateComponent(db, { notes: 'Primary' })
    if (!noted.ok) throw new Error(noted.problems.join())
    expect(noted.element.customData).toEqual({ ...database, notes: 'Primary' })

    const renamed = updateComponent(noted.element, { name: 'Orders DB' })
    if (!renamed.ok) throw new Error(renamed.problems.join())
    expect(readNotes(renamed.element)).toBe('Primary')

    const cleared = updateComponent(renamed.element, { notes: '' })
    expect(cleared.ok && cleared.element.customData).toEqual({
      ...database,
      name: 'Orders DB',
    })
  })

  it('rejects notes that are too long', () => {
    expect(updateComponent(db, { notes: 'x'.repeat(2001) })).toEqual({
      ok: false,
      problems: ['notes must be at most 2000 characters'],
    })
  })
})

describe('setAccent', () => {
  it('sets the stroke colour, or returns the same element', () => {
    expect(setAccent(db, '#81a6ee').strokeColor).toBe(canvasColor('#81a6ee'))
    const blue = el({ strokeColor: canvasColor('#81a6ee') })
    expect(setAccent(blue, '#81a6ee')).toBe(blue)
  })
})

describe('resizeAroundCentre', () => {
  // A 200x100 card centred on (200, 150).
  const card = el({ id: 'card', x: 100, y: 100, width: 200, height: 100 })
  const label = el({
    id: 'label',
    type: 'text',
    containerId: 'card',
    x: 150,
    y: 140,
    width: 100,
    height: 20,
    textAlign: 'center',
    verticalAlign: 'middle',
  })
  const topLabel = el({
    id: 'top',
    type: 'text',
    containerId: 'card',
    x: 105,
    y: 105,
    textAlign: 'left',
    verticalAlign: 'top',
  })
  // Leaves the card's right edge (305, 150) for a point at (505, 150).
  const outgoing = el({
    id: 'out',
    type: 'arrow',
    x: 305,
    y: 150,
    startBinding: { elementId: 'card' },
    endBinding: { elementId: 'other' },
    points: [
      [0, 0],
      [200, 0],
    ],
  })
  // Comes from (0, 150) into the card's left edge (95, 150).
  const incoming = el({
    id: 'in',
    type: 'arrow',
    x: 0,
    y: 150,
    startBinding: null,
    endBinding: { elementId: 'card' },
    points: [
      [0, 0],
      [95, 0],
    ],
  })
  const all = [card, label, topLabel, outgoing, incoming]
  const large = SIZES[2]

  it('grows the card around its centre', () => {
    const [resized] = resizeAroundCentre(card, large, all)
    expect(resized).toMatchObject({ x: 80, y: 90, width: 240, height: 120 })
    expect(currentSize(resized)).toBe(large)
  })

  it('keeps centred text in place and top-left text in its corner', () => {
    const changed = resizeAroundCentre(card, large, all)
    expect(changed.find((e) => e.id === 'label')).toMatchObject({
      x: 150,
      y: 140,
    })
    expect(changed.find((e) => e.id === 'top')).toMatchObject({ x: 85, y: 95 })
  })

  it('moves bound arrow ends with the card edges', () => {
    const changed = resizeAroundCentre(card, large, all)
    // Start end scales away from the centre: 200 + 105 * 1.2 = 326.
    const out = changed.find((e) => e.id === 'out') as unknown as {
      x: number
      y: number
      points: number[][]
      width: number
    }
    expect(out.x).toBe(326)
    expect(out.y).toBe(150)
    expect(out.points).toEqual([
      [0, 0],
      [179, 0],
    ])
    expect(out.width).toBe(179)
    // End end: 200 - 105 * 1.2 = 74, so the last point is 74 from x = 0.
    const into = changed.find((e) => e.id === 'in') as unknown as {
      x: number
      points: number[][]
    }
    expect(into.x).toBe(0)
    expect(into.points).toEqual([
      [0, 0],
      [74, 0],
    ])
  })

  it('changes nothing when the size already matches', () => {
    expect(resizeAroundCentre(card, { width: 200, height: 100 }, all)).toEqual(
      [],
    )
  })
})

describe('deleteElements', () => {
  it('deletes the elements and the labels inside them', () => {
    const label = el({ id: 'label', type: 'text', containerId: 'db' })
    const deleted = deleteElements(['db', 'arrow'], [...scene, label])
    expect(deleted.map((e) => [e.id, e.isDeleted])).toEqual([
      ['db', true],
      ['arrow', true],
      ['label', true],
    ])
  })
})
