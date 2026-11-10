import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it, vi } from 'vitest'
import { selectedComponent } from './selectedComponent.ts'

// updateComponent.ts imports Excalidraw, which needs a browser canvas to load.
// Nothing here calls newElementWith, so an empty stand-in is enough.
vi.mock('@excalidraw/excalidraw', () => ({ newElementWith: vi.fn() }))

type RectangleElement = Extract<OrderedExcalidrawElement, { type: 'rectangle' }>

const validDatabase = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const rectangle = ({
  id,
  customData,
  isDeleted = false,
}: {
  id: string
  customData?: Record<string, unknown>
  isDeleted?: boolean
}): RectangleElement => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
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
  index: id as RectangleElement['index'],
  isDeleted,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
  customData,
})

const database = rectangle({ id: 'db', customData: validDatabase })
const cache = rectangle({
  id: 'cache',
  customData: {
    v: 1,
    kind: 'cache',
    name: 'Session cache',
    props: { engine: 'Redis', strategy: 'Cache-aside', ttlSeconds: 300 },
  },
})
const plainShape = rectangle({ id: 'plain' })
const elements = [database, cache, plainShape]

describe('selectedComponent', () => {
  it('returns the element and its data when one component is selected', () => {
    expect(selectedComponent(elements, { db: true })).toEqual({
      element: database,
      data: validDatabase,
    })
  })

  it('returns null when nothing is selected', () => {
    expect(selectedComponent(elements, {})).toBeNull()
  })

  it('returns null when several components are selected', () => {
    expect(selectedComponent(elements, { db: true, cache: true })).toBeNull()
  })

  it('returns null when a plain shape is selected', () => {
    expect(selectedComponent(elements, { plain: true })).toBeNull()
  })

  it('returns null when the selected element is not on the board', () => {
    expect(selectedComponent(elements, { missing: true })).toBeNull()
  })

  it('returns null when the selected element was deleted', () => {
    const deleted = rectangle({
      id: 'deleted',
      customData: validDatabase,
      isDeleted: true,
    })

    expect(selectedComponent([deleted], { deleted: true })).toBeNull()
  })
})
