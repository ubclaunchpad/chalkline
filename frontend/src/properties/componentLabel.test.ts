import { newElementWith } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentData } from '../catalog/catalog.ts'
import { changedElements } from '../realtime/sceneSync.ts'
import { relabelComponent } from './componentLabel.ts'

// The real package needs a browser canvas to load, so stand in for
// newElementWith: copy the element, apply the updates, bump the version.
vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: vi.fn(
    (element: OrderedExcalidrawElement, updates: object) => ({
      ...element,
      ...updates,
      version: element.version + 1,
    }),
  ),
}))

beforeEach(() => {
  vi.mocked(newElementWith).mockClear()
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
  fontFamily: 5 as TextElement['fontFamily'],
  text,
  originalText: text,
  textAlign: 'center',
  verticalAlign: 'middle',
  containerId: 'box',
  autoResize: true,
  lineHeight: 1.25 as TextElement['lineHeight'],
})

describe('relabelComponent', () => {
  it('updates the label text to the new name', () => {
    const container = box(database)
    const oldLabel = label('Users DB\ndatabase')

    const result = relabelComponent(container, [container, oldLabel])
    if (!result) {
      throw new Error('expected an updated label')
    }

    expect(result).toMatchObject({
      id: 'label',
      text: 'Orders DB\ndatabase',
      originalText: 'Orders DB\ndatabase',
      version: 2,
    })
    // Check against sync's own rule, so this fails if the new label would not
    // be sent to other clients.
    expect(changedElements([oldLabel], [result])).toEqual([result])
  })

  it('returns null when the label already shows the name', () => {
    const container = box(database)
    const current = label('Orders DB\ndatabase')

    expect(relabelComponent(container, [container, current])).toBeNull()
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
