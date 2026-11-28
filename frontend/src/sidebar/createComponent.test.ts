import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import { validateComponent } from '../catalog/validate'
import { CARD, CARD_COLORS, DETAIL_WIDTH, NAME_WIDTH } from '../cards/cardLook'
import { cardPartData, readCardPart } from '../cards/cardParts'
import { deriveGraph } from '../graph/deriveGraph'
import {
  collectComponentNames,
  createComponentSkeletons,
  finishComponentElements,
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
      {
        customData: {
          v: 1,
          kind: 'database',
          name: 'Users DB',
          props: { engine: 'PostgreSQL', replicas: 1 },
        },
      },
      {
        customData: {
          v: 1,
          kind: 'cache',
          name: 'Session cache',
          props: { engine: 'Redis', strategy: 'Cache-aside', ttlSeconds: 300 },
        },
      },
    ])
    expect(names).toEqual(new Set(['Users DB', 'Session cache']))
  })

  it('ignores elements without customData or with an unrelated or invalid shape', () => {
    const names = collectComponentNames([
      {},
      { customData: undefined },
      { customData: { foo: 'bar' } },
      {
        customData: {
          v: 2,
          kind: 'database',
          name: 'Wrong version',
          props: { engine: 'PostgreSQL', replicas: 1 },
        },
      },
      {
        customData: {
          v: 1,
          kind: 'database',
          name: 'Missing props',
          props: {},
        },
      },
    ])
    expect(names.size).toBe(0)
  })
})

describe('createComponentSkeletons', () => {
  const create = (names: ReadonlySet<string> = new Set()) => {
    const [container, icon, name, detail] = createComponentSkeletons(
      database,
      { x: 100, y: 100 },
      names,
      'group-1',
    )
    return { container, icon, name, detail }
  }

  it('creates a container, icon, name and detail line in that order', () => {
    const { container, icon, name, detail } = create()

    expect(container.type).toBe('rectangle')
    expect(icon.type).toBe('image')
    expect(name.type).toBe('text')
    expect(detail.type).toBe('text')
    expect(readCardPart(icon)).toBe('icon')
    expect(readCardPart(name)).toBe('name')
    expect(readCardPart(detail)).toBe('detail')
  })

  it('centers a 240x84 card on the given point', () => {
    const { container } = create()

    expect(container.width).toBe(CARD.width)
    expect(container.height).toBe(CARD.height)
    expect(container.x).toBe(100 - CARD.width / 2)
    expect(container.y).toBe(100 - CARD.height / 2)
  })

  it('puts the icon and name on the top row and the detail below', () => {
    const { icon, name, detail } = create()
    // The card's top-left corner when centred on (100, 100).
    const left = 100 - CARD.width / 2
    const top = 100 - CARD.height / 2

    expect(icon).toMatchObject({ x: left + CARD.icon.x, y: top + CARD.icon.y })
    expect(name).toMatchObject({ x: left + CARD.name.x, y: top + CARD.name.y })
    expect(detail).toMatchObject({
      x: left + CARD.detail.x,
      y: top + CARD.detail.y,
    })
  })

  it('puts every part in one group and locks the decorations', () => {
    const parts = createComponentSkeletons(
      database,
      { x: 0, y: 0 },
      new Set(),
      'group-1',
    )

    for (const part of parts) {
      expect(part.groupIds).toEqual(['group-1'])
    }
    expect(parts[0].locked).toBeFalsy()
    expect(parts.slice(1).every((part) => part.locked === true)).toBe(true)
  })

  it('keeps the component data on the container only', () => {
    const { container, icon, name, detail } = create()

    expect(container.customData).toEqual({
      v: 1,
      kind: 'database',
      name: 'Database',
      props: { engine: 'PostgreSQL', replicas: 1 },
    })
    for (const part of [icon, name, detail]) {
      expect(validateComponent(part.customData).ok).toBe(false)
    }
  })

  it('shows the name and the detail line', () => {
    const { name, detail } = create()
    if (name.type !== 'text' || detail.type !== 'text') {
      throw new Error('expected text skeletons')
    }

    expect(name.text).toBe('Database')
    expect(detail.text).toBe('PostgreSQL · 1 replica')
  })

  it('numbers the name when "Database" is already on the board', () => {
    const { container, name } = create(new Set(['Database']))
    if (name.type !== 'text') {
      throw new Error('expected a text skeleton')
    }

    expect((container.customData as { name: string }).name).toBe('Database 2')
    expect(name.text).toBe('Database 2')
  })

  it('draws a dark card with the kind’s icon, not a coloured box', () => {
    const { container, icon } = create()
    if (icon.type !== 'image') {
      throw new Error('expected an image skeleton')
    }

    expect(container.backgroundColor).toBe(CARD_COLORS.fill)
    expect(container.strokeColor).toBe(CARD_COLORS.border)
    expect(icon.fileId).toBe('chalkline-icon-database')
  })

  it('gives the card fixed 10px corners, like the Figma card', () => {
    const { container } = create()

    // Adaptive radius with a value keeps the radius fixed instead of a
    // quarter of the card's height.
    expect(container.roundness).toEqual({ type: 3, value: CARD.radius })
    expect(CARD.radius).toBe(10)
  })

  it('gives each new component its own props object', () => {
    const first = create().container
    const second = create(new Set(['Database'])).container

    const firstData = first.customData as { props: unknown }
    const secondData = second.customData as { props: unknown }
    expect(firstData.props).not.toBe(secondData.props)
    expect(firstData.props).not.toBe(database.defaultProps)
  })

  it('gives each card a new group id by default', () => {
    const [first] = createComponentSkeletons(
      database,
      { x: 0, y: 0 },
      new Set(),
    )
    const [second] = createComponentSkeletons(
      database,
      { x: 0, y: 0 },
      new Set(),
    )

    expect(first.groupIds?.[0]).toMatch(/^[0-9a-f]{24}$/)
    expect(first.groupIds?.[0]).not.toBe(second.groupIds?.[0])
  })
})

describe('finishComponentElements', () => {
  it('gives the text lines their fixed width and leaves the rest alone', () => {
    const container = {
      id: 'box',
      width: 240,
      customData: { v: 1, kind: 'database' },
    }
    const name = { id: 'n', width: 3, customData: cardPartData('name') }
    const detail = { id: 'd', width: 7, customData: cardPartData('detail') }

    const finished = finishComponentElements([
      container,
      name,
      detail,
    ] as unknown as ExcalidrawElement[])

    expect(finished[0]).toBe(container)
    expect(finished[1].width).toBe(NAME_WIDTH)
    expect(finished[2].width).toBe(DETAIL_WIDTH)
  })
})

describe('new cards in the graph', () => {
  it('give exactly one node and no diagnostics', () => {
    // Stand-ins for what convertToExcalidrawElements would return: the same
    // fields, with ids and the defaults deriveGraph does not read.
    const elements = createComponentSkeletons(
      database,
      { x: 0, y: 0 },
      new Set(),
      'group-1',
    ).map((skeleton, index) => ({
      ...skeleton,
      id: `element-${String(index)}`,
      isDeleted: false,
    })) as unknown as ExcalidrawElement[]

    const graph = deriveGraph(elements)

    expect(Object.keys(graph.nodes)).toEqual(['element-0'])
    expect(graph.diagnostics).toEqual([])
  })
})
