import { describe, expect, it } from 'vitest'
import {
  clampPosition,
  defaultPosition,
  dockPlacement,
  EDGE_MARGIN,
  KEYBOARD_LARGE_STEP,
  KEYBOARD_STEP,
  nudgePlacement,
  nudgePosition,
  parsePlacement,
  linesThatFit,
  type ToolbarLayout,
} from './position'

const layout: ToolbarLayout = {
  bounds: { width: 800, height: 600 },
  toolbar: { width: 50, height: 300 },
}

describe('clampPosition', () => {
  it('keeps a position that already fits', () => {
    expect(clampPosition({ x: 100, y: 120 }, layout)).toEqual({
      x: 100,
      y: 120,
    })
  })

  it('clamps to every canvas edge', () => {
    expect(clampPosition({ x: -50, y: -50 }, layout)).toEqual({
      x: EDGE_MARGIN,
      y: EDGE_MARGIN,
    })
    expect(clampPosition({ x: 5000, y: 5000 }, layout)).toEqual({
      x: 800 - 50 - EDGE_MARGIN,
      y: 600 - 300 - EDGE_MARGIN,
    })
  })

  it('stays at the top-left margin when the toolbar is larger than the canvas', () => {
    const tiny = { ...layout, bounds: { width: 20, height: 100 } }
    expect(clampPosition({ x: 300, y: 300 }, tiny)).toEqual({
      x: EDGE_MARGIN,
      y: EDGE_MARGIN,
    })
  })
})

describe('defaultPosition', () => {
  it('centres the toolbar vertically near the left edge', () => {
    expect(defaultPosition(layout)).toEqual({ x: 16, y: 150 })
  })
})

describe('nudgePosition', () => {
  const start = { x: 200, y: 200 }

  it.each([
    ['ArrowUp', { x: 200, y: 200 - KEYBOARD_STEP }],
    ['ArrowDown', { x: 200, y: 200 + KEYBOARD_STEP }],
    ['ArrowLeft', { x: 200 - KEYBOARD_STEP, y: 200 }],
    ['ArrowRight', { x: 200 + KEYBOARD_STEP, y: 200 }],
  ])('moves one step for %s', (key, expected) => {
    expect(nudgePosition(start, key, false, layout)).toEqual(expected)
  })

  it('uses the large step and still clamps', () => {
    expect(nudgePosition(start, 'ArrowRight', true, layout)).toEqual({
      x: 200 + KEYBOARD_LARGE_STEP,
      y: 200,
    })
    expect(
      nudgePosition({ x: EDGE_MARGIN, y: 200 }, 'ArrowLeft', true, layout),
    ).toEqual({ x: EDGE_MARGIN, y: 200 })
  })

  it('ignores other keys, including inherited property names', () => {
    expect(nudgePosition(start, 'a', false, layout)).toBeNull()
    expect(nudgePosition(start, 'toString', false, layout)).toBeNull()
  })
})

describe('dockPlacement', () => {
  it.each([
    ['left', { x: 20, y: 300 }, { x: EDGE_MARGIN, y: 150 }, 'vertical'],
    ['right', { x: 780, y: 300 }, { x: 742, y: 150 }, 'vertical'],
    ['top', { x: 400, y: 20 }, { x: 250, y: EDGE_MARGIN }, 'horizontal'],
    ['bottom', { x: 400, y: 580 }, { x: 250, y: 542 }, 'horizontal'],
  ] as const)(
    'docks to the %s edge',
    (_edge, pointer, expected, orientation) => {
      expect(dockPlacement(pointer, layout, 'vertical')).toEqual({
        ...expected,
        orientation,
      })
    },
  )

  it('uses the nearest edge from the middle of the canvas', () => {
    expect(dockPlacement({ x: 300, y: 250 }, layout, 'vertical')).toMatchObject(
      { orientation: 'horizontal', y: EDGE_MARGIN },
    )
  })

  it('stays on the canvas near a corner', () => {
    expect(dockPlacement({ x: 790, y: 590 }, layout, 'vertical')).toEqual({
      x: 742,
      y: 292,
      orientation: 'vertical',
    })
  })

  it('swaps the size only when the orientation changes', () => {
    const horizontal = {
      ...layout,
      toolbar: { width: 300, height: 50 },
    }
    expect(dockPlacement({ x: 400, y: 20 }, horizontal, 'horizontal')).toEqual({
      x: 250,
      y: EDGE_MARGIN,
      orientation: 'horizontal',
    })
  })
})

describe('nudgePlacement', () => {
  it('keeps the orientation while there is room to move', () => {
    expect(
      nudgePlacement(
        { x: 200, y: 200, orientation: 'vertical' },
        'ArrowDown',
        false,
        layout,
      ),
    ).toEqual({ x: 200, y: 200 + KEYBOARD_STEP, orientation: 'vertical' })
  })

  it('docks flush to the edge it is pushed against', () => {
    expect(
      nudgePlacement(
        { x: 200, y: 600 - 300 - EDGE_MARGIN, orientation: 'vertical' },
        'ArrowDown',
        false,
        layout,
      ),
    ).toEqual({ x: 200, y: 600 - 50 - EDGE_MARGIN, orientation: 'horizontal' })
  })

  it('stays put against an edge that matches its orientation', () => {
    const placement = {
      x: EDGE_MARGIN,
      y: 200,
      orientation: 'vertical',
    } as const
    expect(nudgePlacement(placement, 'ArrowLeft', false, layout)).toEqual(
      placement,
    )
  })

  it('ignores other keys', () => {
    expect(
      nudgePlacement(
        { x: 200, y: 200, orientation: 'vertical' },
        'a',
        false,
        layout,
      ),
    ).toBeNull()
  })
})

describe('linesThatFit', () => {
  it('uses one column when every item fits', () => {
    expect(linesThatFit(600, 8, 36, 4, 4)).toBe(8)
  })

  it('reduces rows at the exact fit boundary', () => {
    // 3 items need 3*36 + 2*4 + 2*4 padding + 2*8 margin = 140px.
    expect(linesThatFit(140, 8, 36, 4, 4)).toBe(3)
    expect(linesThatFit(139, 8, 36, 4, 4)).toBe(2)
  })

  it('always keeps at least one row', () => {
    expect(linesThatFit(0, 8, 36, 4, 4)).toBe(1)
  })
})

describe('parsePlacement', () => {
  it('reads a stored position', () => {
    expect(parsePlacement('{"x":10,"y":20}')).toEqual({
      x: 10,
      y: 20,
      orientation: 'vertical',
    })
  })

  it.each([
    null,
    'not json',
    'null',
    '[]',
    '{"x":10}',
    '{"x":"10","y":20}',
    '{"x":1e999,"y":20}',
  ])('rejects %s', (stored) => {
    expect(parsePlacement(stored)).toBeNull()
  })
})
