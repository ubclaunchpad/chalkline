import { describe, expect, it } from 'vitest'
import {
  collectComponentNames,
  createComponentSkeleton,
  nextComponentName,
} from './createComponent'
import { catalog } from './catalog'

const database = catalog.find((entry) => entry.kind === 'database')
if (!database) {
  throw new Error('expected a database entry in the catalog')
}

describe('nextComponentName', () => {
  it('uses the label when no component has it yet', () => {
    expect(nextComponentName('Database', new Set())).toBe('Database')
  })

  it('appends 2 when the label is already taken', () => {
    expect(nextComponentName('Database', new Set(['Database']))).toBe(
      'Database 2',
    )
  })

  it('skips taken numbers to find the lowest free one', () => {
    const existing = new Set(['Database', 'Database 2', 'Database 3'])
    expect(nextComponentName('Database', existing)).toBe('Database 4')
  })

  it('leaves a gap usable: picks the lowest free suffix, not always the next', () => {
    const existing = new Set(['Database', 'Database 3'])
    expect(nextComponentName('Database', existing)).toBe('Database 2')
  })
})

describe('collectComponentNames', () => {
  it('collects names from elements with valid component customData', () => {
    const names = collectComponentNames([
      { customData: { v: 1, kind: 'database', name: 'Users DB', props: {} } },
      { customData: { v: 1, kind: 'cache', name: 'Session cache', props: {} } },
    ])
    expect(names).toEqual(new Set(['Users DB', 'Session cache']))
  })

  it('ignores elements without customData or with an unrelated shape', () => {
    const names = collectComponentNames([
      {},
      { customData: undefined },
      { customData: { foo: 'bar' } },
      {
        customData: {
          v: 2,
          kind: 'database',
          name: 'Wrong version',
          props: {},
        },
      },
    ])
    expect(names.size).toBe(0)
  })
})

describe('createComponentSkeleton', () => {
  it('creates a rectangle sized 180x100 centered on the given point', () => {
    const skeleton = createComponentSkeleton(
      database,
      { x: 100, y: 100 },
      new Set(),
    )

    expect(skeleton.type).toBe('rectangle')
    expect(skeleton.width).toBe(180)
    expect(skeleton.height).toBe(100)
    expect(skeleton.x).toBe(100 - 90)
    expect(skeleton.y).toBe(100 - 50)
  })

  it('stamps customData with the kind, a name, and default props', () => {
    const skeleton = createComponentSkeleton(
      database,
      { x: 0, y: 0 },
      new Set(),
    )

    expect(skeleton.customData).toEqual({
      v: 1,
      kind: 'database',
      name: 'Database',
      props: { engine: 'PostgreSQL', replicas: 1 },
    })
  })

  it('numbers the name when "Database" is already on the board', () => {
    const skeleton = createComponentSkeleton(
      database,
      { x: 0, y: 0 },
      new Set(['Database']),
    )

    expect((skeleton.customData as { name: string }).name).toBe('Database 2')
  })

  it('labels the shape with the name and kind', () => {
    const skeleton = createComponentSkeleton(
      database,
      { x: 0, y: 0 },
      new Set(),
    )
    if (skeleton.type !== 'rectangle') {
      throw new Error('expected a rectangle skeleton')
    }

    expect(skeleton.label?.text).toBe('Database\ndatabase')
  })
})
