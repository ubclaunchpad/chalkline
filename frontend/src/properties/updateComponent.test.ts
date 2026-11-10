import { newElementWith } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readComponent,
  updateComponent,
  type UpdateResult,
} from './updateComponent.ts'

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

const validDatabase = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const rectangle = (customData?: Record<string, unknown>): RectangleElement => ({
  id: 'db',
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
  index: 'a0' as RectangleElement['index'],
  isDeleted: false,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
  customData,
})

// Returns the updated element, failing the test with the problems if the
// update was rejected. Throwing also narrows the result for TypeScript.
function updatedElement(result: UpdateResult): OrderedExcalidrawElement {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.problems.join('; ')}`)
  }
  return result.element
}

describe('readComponent', () => {
  it('returns the data of a component', () => {
    expect(readComponent(rectangle(validDatabase))).toEqual(validDatabase)
  })

  it('returns null for a plain shape', () => {
    expect(readComponent(rectangle())).toBeNull()
  })

  it('returns null for invalid component data', () => {
    const element = rectangle({ ...validDatabase, kind: 'blockchain' })
    expect(readComponent(element)).toBeNull()
  })
})

describe('updateComponent', () => {
  it('changes one setting and keeps the others', () => {
    const element = rectangle(validDatabase)
    const result = updateComponent(element, { props: { engine: 'MySQL' } })

    expect(updatedElement(result).customData).toEqual({
      ...validDatabase,
      props: { engine: 'MySQL', replicas: 1 },
    })
  })

  it('renames a component and keeps its settings', () => {
    const element = rectangle(validDatabase)
    const result = updateComponent(element, { name: 'Orders DB' })

    expect(updatedElement(result).customData).toEqual({
      ...validDatabase,
      name: 'Orders DB',
    })
  })

  it('saves through newElementWith so the version is bumped and syncs', () => {
    const element = rectangle(validDatabase)
    const updated = updatedElement(
      updateComponent(element, { props: { replicas: 3 } }),
    )

    expect(newElementWith).toHaveBeenCalledWith(element, {
      customData: {
        ...validDatabase,
        props: { engine: 'PostgreSQL', replicas: 3 },
      },
    })
    expect(updated.version).toBe(2)
  })

  it('does not save an invalid change', () => {
    updateComponent(rectangle(validDatabase), { props: { replicas: 0 } })

    expect(newElementWith).not.toHaveBeenCalled()
  })

  it('returns a new element and leaves the original unchanged', () => {
    const element = rectangle(validDatabase)
    const updated = updatedElement(
      updateComponent(element, { props: { replicas: 3 } }),
    )

    expect(updated).not.toBe(element)
    expect(element.version).toBe(1)
    expect(element.customData).toEqual(validDatabase)
  })

  it('rejects a number below the minimum', () => {
    const result = updateComponent(rectangle(validDatabase), {
      props: { replicas: 0 },
    })

    expect(result).toEqual({
      ok: false,
      problems: ['replicas must be at least 1'],
    })
  })

  it('rejects an empty name', () => {
    const result = updateComponent(rectangle(validDatabase), { name: '' })

    expect(result).toEqual({ ok: false, problems: ['name is required'] })
  })

  it('rejects a choice that is not one of the options', () => {
    const result = updateComponent(rectangle(validDatabase), {
      props: { engine: 'Oracle' },
    })

    expect(result).toEqual({
      ok: false,
      problems: ['engine must be one of: PostgreSQL, MySQL, MongoDB, DynamoDB'],
    })
  })

  it('rejects a setting the kind does not have', () => {
    const result = updateComponent(rectangle(validDatabase), {
      props: { color: 'red' },
    })

    expect(result).toEqual({
      ok: false,
      problems: ['unknown setting: color'],
    })
  })

  it('rejects updating a plain shape', () => {
    const result = updateComponent(rectangle(), { name: 'Users DB' })

    expect(result).toEqual({
      ok: false,
      problems: ['element is not a component'],
    })
  })
})
