import {
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentData } from '../catalog/catalog.ts'
import { changedElements } from '../realtime/sceneSync.ts'
import { relabelComponent } from './componentLabel.ts'

// The real package needs a browser canvas to load, so stand in for it.
// newElementWith copies the element, applies the updates and bumps the
// version. convertToExcalidrawElements returns whatever each test sets, which
// plays the part of Excalidraw's measured copy of the box and label.
vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: vi.fn(
    (element: OrderedExcalidrawElement, updates: object) => ({
      ...element,
      ...updates,
      version: element.version + 1,
    }),
  ),
  convertToExcalidrawElements: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(newElementWith).mockClear()
  vi.mocked(convertToExcalidrawElements).mockReset()
})

type RectangleElement = Extract<OrderedExcalidrawElement, { type: 'rectangle' }>
type TextElement = Extract<OrderedExcalidrawElement, { type: 'text' }>

const database: ComponentData = {
  v: 1,
  kind: 'database',
  name: 'Orders DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const base = {
  x: 0,
  y: 0,
  width: 180,
  height: 100,
  angle: 0,
  strokeColor: '#1b1b1f',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 1,
  strokeStyle: 'solid',
  roundness: null,
  roughness: 1,
  opacity: 100,
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  updated: 1,
  link: null,
  locked: false,
} as const

const box = (
  customData: Record<string, unknown> | undefined,
  labelId: string | null = 'label',
): RectangleElement => ({
  ...base,
  id: 'box',
  type: 'rectangle',
  index: 'a0' as RectangleElement['index'],
  boundElements: labelId ? [{ id: labelId, type: 'text' }] : null,
  customData,
})

const label = (text: string, isDeleted = false): TextElement => ({
  ...base,
  id: 'label',
  type: 'text',
  index: 'a1' as TextElement['index'],
  isDeleted,
  boundElements: null,
  fontSize: 20,
  fontFamily: 5,
  text,
  originalText: text,
  textAlign: 'center',
  verticalAlign: 'middle',
  containerId: 'box',
  autoResize: true,
  lineHeight: 1.25 as TextElement['lineHeight'],
})

// Makes the fake Excalidraw "measure" the new label: wrapped text, a size and
// a position, plus the box height Excalidraw would need to fit it.
function measuresAs({
  text,
  boxHeight = base.height,
}: {
  text: string
  boxHeight?: number
}) {
  vi.mocked(convertToExcalidrawElements).mockReturnValue([
    { ...box(undefined), id: 'throwaway-box', height: boxHeight },
    {
      ...label(text),
      id: 'throwaway-label',
      x: 15,
      y: 25,
      width: 150,
      height: 50,
    },
  ])
}

describe('relabelComponent', () => {
  it('gives the real label the measured text, size and position', () => {
    measuresAs({ text: 'Orders DB\ndatabase' })
    const container = box(database)
    const oldLabel = label('Users DB\ndatabase')

    const result = relabelComponent(container, [container, oldLabel])
    if (!result) {
      throw new Error('expected an updated label')
    }

    expect(result.label).toMatchObject({
      id: 'label',
      text: 'Orders DB\ndatabase',
      originalText: 'Orders DB\ndatabase',
      x: 15,
      y: 25,
      width: 150,
      height: 50,
      version: 2,
    })
    // Check against sync's own rule, so this fails if the new label would not
    // be sent to other clients.
    expect(changedElements([oldLabel], [result.label])).toEqual([result.label])
  })

  it('measures with the same box size and font as the real label', () => {
    measuresAs({ text: 'Orders DB\ndatabase' })
    const container = box(database)

    relabelComponent(container, [container, label('Users DB\ndatabase')])

    // The skeletons the throwaway copy was built from.
    const skeletons = vi.mocked(convertToExcalidrawElements).mock.calls[0][0]

    expect(skeletons).toMatchObject([
      {
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 180,
        height: 100,
        label: { text: 'Orders DB\ndatabase', fontSize: 20, fontFamily: 5 },
      },
    ])
  })

  it('keeps wrapped text but remembers what was written', () => {
    measuresAs({ text: 'A very long\nname\ndatabase' })
    const container = box({ ...database, name: 'A very long name' })

    const result = relabelComponent(container, [container, label('Old')])

    expect(result?.label).toMatchObject({
      text: 'A very long\nname\ndatabase',
      originalText: 'A very long name\ndatabase',
    })
  })

  it('leaves the box alone when the text fits', () => {
    measuresAs({ text: 'Orders DB\ndatabase' })
    const container = box(database)

    const result = relabelComponent(container, [container, label('Old')])

    expect(result?.container).toBe(container)
  })

  it('grows the box when the text needs more room', () => {
    measuresAs({ text: 'A very long\nname\ndatabase', boxHeight: 140 })
    const container = box({ ...database, name: 'A very long name' })

    const result = relabelComponent(container, [container, label('Old')])
    if (!result) {
      throw new Error('expected an updated label')
    }

    expect(result.container).toMatchObject({
      id: 'box',
      width: 180,
      height: 140,
      version: 2,
    })
    expect(changedElements([container], [result.container])).toEqual([
      result.container,
    ])
  })

  it('returns null when the label already shows the name', () => {
    const container = box(database)
    const current = label('Orders DB\ndatabase')

    expect(relabelComponent(container, [container, current])).toBeNull()
    expect(convertToExcalidrawElements).not.toHaveBeenCalled()
    expect(newElementWith).not.toHaveBeenCalled()
  })

  it('returns null when the box has no label', () => {
    const container = box(database, null)

    expect(relabelComponent(container, [container])).toBeNull()
  })

  it('returns null when the label was deleted', () => {
    const container = box(database)
    const deleted = label('Users DB\ndatabase', true)

    expect(relabelComponent(container, [container, deleted])).toBeNull()
  })

  it('returns null for a plain shape', () => {
    const container = box(undefined)
    const text = label('hello')

    expect(relabelComponent(container, [container, text])).toBeNull()
  })
})
