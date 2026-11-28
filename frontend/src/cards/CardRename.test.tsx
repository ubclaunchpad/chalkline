// @vitest-environment jsdom
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardRename } from './CardRename.tsx'
import { cardAt, cardPartData, type CardPart } from './cardParts.ts'

// The real package needs a browser canvas to load. The coordinate helpers use
// Excalidraw's formulas; with zoom 1 and no scroll they are the identity.
vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY' },
  newElementWith: (element: OrderedExcalidrawElement, updates: object) => ({
    ...element,
    ...updates,
    version: element.version + 1,
  }),
  viewportCoordsToSceneCoords: ({
    clientX,
    clientY,
  }: {
    clientX: number
    clientY: number
  }) => ({ x: clientX, y: clientY }),
  sceneCoordsToViewportCoords: ({
    sceneX,
    sceneY,
  }: {
    sceneX: number
    sceneY: number
  }) => ({ x: sceneX, y: sceneY }),
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
    groupIds: ['g1'],
    version: 1,
    angle: 0,
    ...fields,
  }) as unknown as OrderedExcalidrawElement

const text = (
  id: string,
  kind: CardPart,
  box: { x: number; y: number; width: number; height: number },
  value: string,
) =>
  element({
    id,
    type: 'text',
    ...box,
    fontSize: 16,
    text: value,
    originalText: value,
    customData: cardPartData(kind),
  })

// A card at (0, 0), 240x84. Name line: x 44-224, y 16-36. Detail line:
// x 16-224, y 48-64.
const card = () => [
  element({
    id: 'box',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 240,
    height: 84,
    customData: database,
  }),
  text('name', 'name', { x: 44, y: 16, width: 180, height: 20 }, 'orders'),
  text(
    'detail',
    'detail',
    { x: 16, y: 48, width: 208, height: 16 },
    'PostgreSQL · 1 replica',
  ),
]

let scene: OrderedExcalidrawElement[] = []
let tool = 'selection'
let sceneListeners: (() => void)[] = []
const updateScene = vi.fn(
  ({ elements }: { elements: OrderedExcalidrawElement[] }) => {
    scene = elements
  },
)
const api = {
  getAppState: () => ({
    activeTool: { type: tool },
    viewModeEnabled: false,
    editingTextElement: null,
    zoom: { value: 1 },
  }),
  getSceneElements: () => scene.filter((each) => !each.isDeleted),
  getSceneElementsIncludingDeleted: () => scene,
  updateScene,
  onChange: (listener: () => void) => {
    sceneListeners.push(listener)
    return () => {
      sceneListeners = sceneListeners.filter((each) => each !== listener)
    }
  },
} as unknown as ExcalidrawImperativeAPI

// Stands in for Excalidraw's own double-click handler, which React attaches
// above the canvas.
const excalidrawDoubleClick = vi.fn()

// Like the app: a wrapper holding Excalidraw's focusable container (where
// focus returns after a rename) and a toolbar over the board.
function Board() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div onDoubleClick={excalidrawDoubleClick}>
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
        <button type="button">Zoom in</button>
      </div>
      <CardRename api={api} canvasRef={ref} />
    </div>
  )
}

const doubleClick = (x: number, y: number, target?: HTMLElement) =>
  fireEvent.doubleClick(target ?? screen.getByTestId('board'), {
    clientX: x,
    clientY: y,
  })

// Double-clicks the card's name line and returns the rename box.
const openRename = () => {
  render(<Board />)
  doubleClick(60, 25)
  return screen.getByRole('textbox')
}

const nameOf = (id: string) => {
  const found = scene.find((each) => each.id === id) as unknown as {
    text?: string
    customData?: { name?: string }
  }
  return found.text ?? found.customData?.name
}

beforeEach(() => {
  scene = card()
  tool = 'selection'
  sceneListeners = []
  updateScene.mockClear()
  excalidrawDoubleClick.mockClear()
})

afterEach(cleanup)

describe('CardRename', () => {
  it('opens a box with the full name on a double-click on the name', () => {
    const box = openRename()

    expect(box).toBe(screen.getByRole('textbox', { name: 'Rename orders' }))
    expect(box).toHaveProperty('value', 'orders')
    expect(document.activeElement).toBe(box)
    expect(excalidrawDoubleClick).not.toHaveBeenCalled()
  })

  it('sizes the box from the name line', () => {
    const box = openRename()

    expect(box.parentElement?.style.width).toBe('180px')
    expect(box.style.fontSize).toBe('16px')
  })

  it('saves once on Enter and returns focus to the board', () => {
    const box = openRename()
    fireEvent.change(box, { target: { value: 'billing' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    // Returning focus blurs the box; that blur must not save again.
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: 'IMMEDIATELY' }),
    )
    expect(nameOf('box')).toBe('billing')
    expect(nameOf('name')).toBe('billing')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('excalidraw'))
  })

  it('cancels on Escape without saving, even as focus leaves the box', () => {
    const box = openRename()
    fireEvent.change(box, { target: { value: 'billing' } })
    fireEvent.keyDown(box, { key: 'Escape' })

    expect(updateScene).not.toHaveBeenCalled()
    expect(nameOf('box')).toBe('orders')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('excalidraw'))
  })

  it('rejects an invalid name with the panel’s message and keeps the box open', () => {
    const box = openRename()
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(screen.getByRole('alert').textContent).toBe('name is required')
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('does not save on the Enter that confirms an input-method composition', () => {
    const box = openRename()
    fireEvent.change(box, { target: { value: 'billing' } })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })

    expect(updateScene).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBe(box)
  })

  it('saves a valid name when the box loses focus', () => {
    const box = openRename()
    fireEvent.change(box, { target: { value: 'billing' } })
    fireEvent.blur(box)

    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(nameOf('box')).toBe('billing')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps the old name when the box loses focus with an invalid one', () => {
    const box = openRename()
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.blur(box)

    expect(updateScene).not.toHaveBeenCalled()
    expect(nameOf('box')).toBe('orders')
  })

  it('does not write anything when the name is unchanged', () => {
    const box = openRename()
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(updateScene).not.toHaveBeenCalled()
  })

  it('closes the box if the card is deleted while renaming', () => {
    openRename()
    act(() => {
      scene = scene.map((each) => ({ ...each, isDeleted: true }))
      for (const listener of sceneListeners) listener()
    })

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('keeps typing away from key listeners on the document', () => {
    // Excalidraw adds some of its own key listeners on the document.
    const documentListener = vi.fn()
    document.addEventListener('keydown', documentListener)
    const box = openRename()
    fireEvent.keyDown(box, { key: 'Delete' })
    document.removeEventListener('keydown', documentListener)

    expect(documentListener).not.toHaveBeenCalled()
  })

  it('swallows double-clicks elsewhere on a card without opening the box', () => {
    // Excalidraw would enter the card's group, and a second double-click
    // would add a stray label inside the card.
    render(<Board />)
    doubleClick(30, 56) // detail line
    doubleClick(230, 76) // card body

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(excalidrawDoubleClick).not.toHaveBeenCalled()
  })

  it('leaves double-clicks on empty board to Excalidraw', () => {
    render(<Board />)
    doubleClick(400, 400)

    expect(excalidrawDoubleClick).toHaveBeenCalledTimes(1)
  })

  it('leaves a shape drawn over the name to Excalidraw', () => {
    scene = [
      ...card(),
      element({
        id: 'note',
        type: 'rectangle',
        groupIds: [],
        x: 40,
        y: 10,
        width: 100,
        height: 40,
      }),
    ]
    render(<Board />)
    doubleClick(60, 25)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(excalidrawDoubleClick).toHaveBeenCalledTimes(1)
  })

  it('ignores double-clicks on controls over the board', () => {
    render(<Board />)
    doubleClick(60, 25, screen.getByRole('button', { name: 'Zoom in' }))

    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('ignores double-clicks while another tool is active', () => {
    tool = 'rectangle'
    render(<Board />)
    doubleClick(60, 25)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(excalidrawDoubleClick).toHaveBeenCalledTimes(1)
  })
})

describe('cardAt', () => {
  it('finds the card and whether the point is on its name', () => {
    expect(cardAt(card() as never, { x: 100, y: 30 })).toMatchObject({
      container: { id: 'box' },
      onName: true,
    })
    expect(cardAt(card() as never, { x: 100, y: 60 })).toMatchObject({
      container: { id: 'box' },
      onName: false,
    })
  })

  it('is null off the card, for rotated cards and for old cards', () => {
    const rotated = card().map((each) => ({ ...each, angle: 0.5 }))
    const old = [
      element({
        id: 'old',
        type: 'rectangle',
        groupIds: [],
        x: 0,
        y: 0,
        width: 240,
        height: 84,
        customData: database,
      }),
    ]

    expect(cardAt(card() as never, { x: 300, y: 30 })).toBeNull()
    expect(cardAt(rotated as never, { x: 100, y: 30 })).toBeNull()
    expect(cardAt(old as never, { x: 100, y: 30 })).toBeNull()
  })
})
