// @vitest-environment jsdom
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardPartData } from './cardParts.ts'
import { useCardLabelGuard } from './useCardLabelGuard.ts'

// The real package needs a browser canvas to load. With zoom 1 and no scroll,
// Excalidraw's viewport-to-scene formula is the identity.
vi.mock('@excalidraw/excalidraw', () => ({
  viewportCoordsToSceneCoords: ({
    clientX,
    clientY,
  }: {
    clientX: number
    clientY: number
  }) => ({ x: clientX, y: clientY }),
}))

const database = {
  v: 1,
  kind: 'database',
  name: 'orders',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const element = (fields: Record<string, unknown>) =>
  ({
    isDeleted: false,
    groupIds: [],
    angle: 0,
    ...fields,
  }) as unknown as OrderedExcalidrawElement

// A card at (0, 0), 240x84, and a plain rectangle further right.
const scene = [
  element({
    id: 'box',
    type: 'rectangle',
    groupIds: ['g1'],
    x: 0,
    y: 0,
    width: 240,
    height: 84,
    customData: database,
  }),
  element({
    id: 'name',
    type: 'text',
    groupIds: ['g1'],
    x: 44,
    y: 16,
    width: 180,
    height: 20,
    customData: cardPartData('name'),
  }),
  element({
    id: 'plain',
    type: 'rectangle',
    x: 400,
    y: 0,
    width: 100,
    height: 100,
  }),
]

let tool = 'text'
let selected: Record<string, true> = {}
let editingTextElement: object | null = null
const api = {
  getAppState: () => ({
    activeTool: { type: tool },
    selectedElementIds: selected,
    editingTextElement,
    zoom: { value: 1 },
  }),
  getSceneElements: () => scene,
} as unknown as ExcalidrawImperativeAPI

// Stand in for Excalidraw's own handlers, which React attaches above the
// canvas.
const excalidrawPointerDown = vi.fn()
const excalidrawKeyDown = vi.fn()

function Board() {
  const ref = useRef<HTMLDivElement>(null)
  useCardLabelGuard(api, ref)
  return (
    <div onPointerDown={excalidrawPointerDown} onKeyDown={excalidrawKeyDown}>
      <div ref={ref}>
        <div
          className="excalidraw-container"
          tabIndex={-1}
          data-testid="excalidraw"
        >
          <canvas
            className="excalidraw__canvas interactive"
            data-testid="board"
          />
        </div>
        <input aria-label="Rename orders" />
      </div>
    </div>
  )
}

const pressOnBoard = (x: number, y: number) => {
  fireEvent.pointerDown(screen.getByTestId('board'), { clientX: x, clientY: y })
}

const pressEnter = (target = screen.getByTestId('excalidraw')) => {
  fireEvent.keyDown(target, { key: 'Enter' })
}

beforeEach(() => {
  tool = 'text'
  selected = {}
  editingTextElement = null
  excalidrawPointerDown.mockClear()
  excalidrawKeyDown.mockClear()
})

afterEach(cleanup)

describe('useCardLabelGuard with the Text tool', () => {
  it('stops a click on a card from starting a label', () => {
    render(<Board />)
    pressOnBoard(120, 60) // card body
    pressOnBoard(60, 25) // card name

    expect(excalidrawPointerDown).not.toHaveBeenCalled()
  })

  it('lets the Text tool write anywhere else, including on plain shapes', () => {
    render(<Board />)
    pressOnBoard(300, 300) // empty board
    pressOnBoard(450, 50) // plain rectangle

    expect(excalidrawPointerDown).toHaveBeenCalledTimes(2)
  })

  it('leaves clicks on cards alone with other tools', () => {
    tool = 'selection'
    render(<Board />)
    pressOnBoard(120, 60)

    expect(excalidrawPointerDown).toHaveBeenCalledTimes(1)
  })
})

describe('useCardLabelGuard with Enter', () => {
  it('stops Enter from starting a label on a selected card', () => {
    selected = { box: true }
    render(<Board />)
    pressEnter()

    expect(excalidrawKeyDown).not.toHaveBeenCalled()
  })

  it('stops Enter on a card part selected alone', () => {
    selected = { name: true }
    render(<Board />)
    pressEnter()

    expect(excalidrawKeyDown).not.toHaveBeenCalled()
  })

  it('lets Enter through for plain shapes and whole selected cards', () => {
    render(<Board />)
    selected = { plain: true }
    pressEnter()
    // A whole card selected as a group: Excalidraw ignores Enter itself.
    selected = { box: true, name: true }
    pressEnter()

    expect(excalidrawKeyDown).toHaveBeenCalledTimes(2)
  })

  it('lets Enter through while typing in a text box or editing text', () => {
    selected = { box: true }
    render(<Board />)
    pressEnter(screen.getByRole('textbox', { name: 'Rename orders' }))
    editingTextElement = {}
    pressEnter()

    expect(excalidrawKeyDown).toHaveBeenCalledTimes(2)
  })

  it('lets other keys through', () => {
    selected = { box: true }
    render(<Board />)
    fireEvent.keyDown(screen.getByTestId('excalidraw'), { key: 'Delete' })

    expect(excalidrawKeyDown).toHaveBeenCalledTimes(1)
  })
})
