// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolbarApi } from './excalidrawAdapter'
import { FloatingToolbar } from './FloatingToolbar'
import { KEYBOARD_STEP } from './position'
import { TOOLBAR_POSITION_KEY } from './useToolbarPosition'

const BOUNDS = { width: 800, height: 600 }
const TOOLBAR = { width: 46, height: 320 }
const DEFAULT_TRANSFORM = 'translate(16px, 140px)'

let resizeCallbacks: (() => void)[] = []

const fakeApi = () => {
  let type = 'selection'
  let multiElement: unknown = null
  const listeners = new Set<() => void>()
  const pointerUpListeners = new Set<() => void>()
  const setTool = (next: string) => {
    type = next
    listeners.forEach((listener) => {
      listener()
    })
  }
  const setActiveTool = vi.fn(({ type: next }: { type: string }) => {
    setTool(next)
  })
  const api = {
    getAppState: () => ({ activeTool: { type }, multiElement }),
    onChange: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onPointerUp: (listener: () => void) => {
      pointerUpListeners.add(listener)
      return () => pointerUpListeners.delete(listener)
    },
    setActiveTool,
  } as unknown as ToolbarApi
  const setOpenPath = (next: unknown) => {
    multiElement = next
  }
  const pointerUp = () => {
    pointerUpListeners.forEach((listener) => {
      listener()
    })
  }
  return { api, setActiveTool, setTool, setOpenPath, pointerUp }
}

const setBounds = (parent: HTMLElement, width: number, height: number) => {
  Object.defineProperty(parent, 'clientWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(parent, 'clientHeight', {
    configurable: true,
    value: height,
  })
  act(() => {
    resizeCallbacks.forEach((callback) => {
      callback()
    })
  })
}

const setup = (api: ToolbarApi | null = fakeApi().api) => {
  const onToggleComponents = vi.fn()
  const { container } = render(
    <div data-testid="canvas">
      <div className="excalidraw-container" tabIndex={0} />
      <FloatingToolbar
        api={api}
        componentsOpen
        onToggleComponents={onToggleComponents}
      />
    </div>,
  )
  const parent = container.firstElementChild as HTMLElement
  const toolbar = screen.getByRole('toolbar', { name: 'Board tools' })
  Object.defineProperty(toolbar, 'offsetWidth', { value: TOOLBAR.width })
  Object.defineProperty(toolbar, 'offsetHeight', { value: TOOLBAR.height })
  setBounds(parent, BOUNDS.width, BOUNDS.height)
  return {
    parent,
    toolbar,
    handle: screen.getByRole('button', { name: 'Move toolbar' }),
    reset: screen.getByRole<HTMLButtonElement>('button', {
      name: 'Reset toolbar position',
    }),
    onToggleComponents,
  }
}

const controls = (toolbar: HTMLElement) =>
  toolbar.querySelector<HTMLElement>('[data-toolbar-controls]') ?? toolbar

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

const dragBy = (handle: HTMLElement, x: number, y: number) => {
  fireEvent.pointerDown(handle, {
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  })
  fireEvent.pointerMove(handle, {
    pointerId: 1,
    clientX: 100 + x,
    clientY: 100 + y,
  })
}

beforeEach(() => {
  resizeCallbacks = []
  sessionStorage.clear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback)
      }
      observe = () => undefined
      disconnect = () => undefined
    },
  )
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FloatingToolbar tools', () => {
  it('names each tool and exposes its real shortcut', () => {
    setup()

    for (const [name, shortcut] of [
      ['Select', 'V'],
      ['Pan', 'H'],
      ['Rectangle', 'R'],
      ['Arrow', 'A'],
      ['Text', 'T'],
    ] as const) {
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('aria-keyshortcuts')).toBe(shortcut)
      expect(
        document.getElementById(button.getAttribute('aria-describedby') ?? '')
          ?.textContent,
      ).toBe(`${name} (${shortcut})`)
    }
  })

  it('selects a tool by button and updates the highlight', () => {
    const { api, setActiveTool } = fakeApi()
    setup(api)

    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))

    expect(setActiveTool).toHaveBeenCalledWith({ type: 'rectangle' })
    expect(pressed('Rectangle')).toBe('true')
    expect(pressed('Select')).toBe('false')
  })

  it('follows a tool changed by an Excalidraw shortcut', () => {
    const { api, setTool } = fakeApi()
    setup(api)

    act(() => {
      setTool('arrow')
    })
    expect(pressed('Arrow')).toBe('true')

    act(() => {
      setTool('diamond')
    })
    expect(pressed('Arrow')).toBe('false')
  })

  it('returns focus to the canvas after a pointer click only', () => {
    const { parent } = setup()
    const canvas = parent.querySelector<HTMLElement>('.excalidraw-container')
    const rectangle = screen.getByRole('button', { name: 'Rectangle' })

    rectangle.focus()
    fireEvent.click(rectangle, { detail: 0 })
    expect(document.activeElement).toBe(rectangle)

    fireEvent.click(rectangle, { detail: 1 })
    expect(document.activeElement).toBe(canvas)
  })

  it('toggles the components panel', () => {
    const { onToggleComponents } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Components' }))

    expect(onToggleComponents).toHaveBeenCalledOnce()
  })
})

describe('FloatingToolbar arrow completion', () => {
  const watchEscape = (parent: HTMLElement) => {
    const container = parent.querySelector<HTMLElement>('.excalidraw-container')
    if (!container) throw new Error('missing Excalidraw container')
    const onEscape = vi.fn()
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') onEscape()
    })
    return { container, onEscape }
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps an arrow open after its first click', () => {
    const { api, setOpenPath, pointerUp } = fakeApi()
    const { onEscape } = watchEscape(setup(api).parent)

    setOpenPath({ type: 'arrow', lastCommittedPoint: null })
    pointerUp()
    vi.runAllTimers()

    expect(onEscape).not.toHaveBeenCalled()
  })

  it('finishes an arrow on its second click', () => {
    const { api, setOpenPath, pointerUp } = fakeApi()
    const { onEscape } = watchEscape(setup(api).parent)

    setOpenPath({ type: 'arrow', lastCommittedPoint: [10, 10] })
    pointerUp()
    vi.runAllTimers()

    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('keeps a zero-length arrow open instead of deleting it', () => {
    const { api, setOpenPath, pointerUp } = fakeApi()
    const { onEscape } = watchEscape(setup(api).parent)

    setOpenPath({ type: 'arrow', lastCommittedPoint: [0, 0] })
    pointerUp()
    vi.runAllTimers()

    expect(onEscape).not.toHaveBeenCalled()
  })

  it('leaves multi-point lines open between clicks', () => {
    const { api, setOpenPath, pointerUp } = fakeApi()
    const { onEscape } = watchEscape(setup(api).parent)

    setOpenPath({ type: 'line', lastCommittedPoint: [10, 10] })
    pointerUp()
    vi.runAllTimers()

    expect(onEscape).not.toHaveBeenCalled()
  })

  it('finishes an open path before a tool shortcut', () => {
    const { api, setOpenPath } = fakeApi()
    const { container, onEscape } = watchEscape(setup(api).parent)
    setOpenPath({ type: 'arrow', lastCommittedPoint: null })

    fireEvent.keyDown(container, { key: 'v' })

    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('ignores modified keys and shortcuts with nothing open', () => {
    const { api, setOpenPath } = fakeApi()
    const { container, onEscape } = watchEscape(setup(api).parent)

    fireEvent.keyDown(container, { key: 'v' })
    setOpenPath({ type: 'arrow', lastCommittedPoint: null })
    fireEvent.keyDown(container, { key: 'v', metaKey: true })

    expect(onEscape).not.toHaveBeenCalled()
  })

  it('finishes an open path before a toolbar tool change', () => {
    const { api, setActiveTool, setOpenPath } = fakeApi()
    const { onEscape } = watchEscape(setup(api).parent)
    setOpenPath({ type: 'arrow', lastCommittedPoint: null })
    const order: string[] = []
    onEscape.mockImplementation(() => order.push('finish'))
    setActiveTool.mockImplementation(() => order.push('switch'))

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    expect(order).toEqual(['finish', 'switch'])
  })
})

describe('FloatingToolbar movement', () => {
  it('places the handle between Components and Reset', () => {
    const { toolbar } = setup()

    const names = [...toolbar.querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    )

    expect(names.slice(-3)).toEqual([
      'Components',
      'Move toolbar',
      'Reset toolbar position',
    ])
    expect(controls(toolbar).style.gridTemplateRows).toBe(
      'repeat(6, 36px) 12px 36px',
    )
  })

  it('starts near the left edge', () => {
    const { toolbar } = setup()
    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
  })

  it('collapses to the active tool while dragging', () => {
    const { api, setTool } = fakeApi()
    const { handle, toolbar } = setup(api)
    act(() => {
      setTool('rectangle')
    })

    dragBy(handle, 50, 20)

    expect(toolbar.dataset.collapsed).toBe('true')
    expect(screen.getByRole('button', { name: 'Select' }).className).toBe(
      'hidden',
    )
    expect(handle.isConnected).toBe(true)
    expect(
      toolbar
        .querySelector('[data-toolbar-active-tool] svg')
        ?.getAttribute('class'),
    ).toContain('tabler-icon-square')
    expect(toolbar.style.transform).toBe('translate(127px, 97px)')
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBeNull()
  })

  it('expands on release, attached to the nearest edge', () => {
    const { handle, toolbar } = setup()

    dragBy(handle, 50, 20)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 120 })

    expect(toolbar.dataset.collapsed).toBe('false')
    expect(controls(toolbar).classList.contains('grid')).toBe(true)
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal')
    expect(toolbar.style.transform).toBe('translate(8px, 8px)')
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBe(
      '{"x":8,"y":8,"orientation":"horizontal"}',
    )
  })

  it.each([
    ['left', 10, 300, 'vertical', 'translate(8px, 140px)'],
    ['right', 790, 300, 'vertical', 'translate(746px, 140px)'],
    ['top', 400, 10, 'horizontal', 'translate(240px, 8px)'],
    ['bottom', 400, 590, 'horizontal', 'translate(240px, 546px)'],
  ])('docks to the %s edge', (_edge, x, y, orientation, transform) => {
    const { handle, toolbar } = setup()

    dragBy(handle, x - 100, y - 100)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: x, clientY: y })

    expect(toolbar.getAttribute('aria-orientation')).toBe(orientation)
    expect(toolbar.style.transform).toBe(transform)
  })

  it.each([
    ['left', 10, 300, 'true'],
    ['right', 790, 300, 'false'],
    ['top', 400, 10, 'false'],
    ['bottom', 400, 590, 'false'],
  ])('marks whether the %s edge is the left edge', (_edge, x, y, expected) => {
    const { handle, toolbar } = setup()
    expect(toolbar.dataset.leftEdge).toBe('true')

    dragBy(handle, x - 100, y - 100)
    expect(toolbar.dataset.leftEdge).toBe('true')
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: x, clientY: y })

    expect(toolbar.dataset.leftEdge).toBe(expected)
  })

  it('returns to the left edge state on reset', () => {
    sessionStorage.setItem(
      TOOLBAR_POSITION_KEY,
      '{"x":100,"y":8,"orientation":"horizontal"}',
    )
    const { reset, toolbar } = setup()
    expect(toolbar.dataset.leftEdge).toBe('false')

    fireEvent.click(reset)

    expect(toolbar.dataset.leftEdge).toBe('true')
  })

  it('does not collapse or move on a plain handle click', () => {
    const { handle, toolbar } = setup()

    dragBy(handle, 1, 1)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 101, clientY: 101 })

    expect(toolbar.dataset.collapsed).toBe('false')
    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBeNull()
    expect(document.activeElement).toBe(handle)
  })

  it('does not start a move from a tool button', () => {
    const { toolbar } = setup()
    const rectangle = screen.getByRole('button', { name: 'Rectangle' })

    dragBy(rectangle, 50, 20)

    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
  })

  it('ignores arrow keys while a tool button has focus', () => {
    const { toolbar } = setup()
    const rectangle = screen.getByRole('button', { name: 'Rectangle' })

    rectangle.focus()
    fireEvent.keyDown(rectangle, { key: 'ArrowRight' })

    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
  })

  it('restores the orientation when a drag is cancelled', () => {
    const { handle, toolbar } = setup()

    dragBy(handle, 100, 480)
    fireEvent.keyDown(handle, { key: 'Escape' })

    expect(toolbar.dataset.collapsed).toBe('false')
    expect(toolbar.getAttribute('aria-orientation')).toBe('vertical')
    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
  })

  it('restores a saved orientation and resets to vertical', () => {
    sessionStorage.setItem(
      TOOLBAR_POSITION_KEY,
      '{"x":100,"y":8,"orientation":"horizontal"}',
    )
    const { reset, toolbar } = setup()
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal')

    fireEvent.click(reset)

    expect(toolbar.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('pivots when an arrow key pushes against an edge', () => {
    sessionStorage.setItem(TOOLBAR_POSITION_KEY, '{"x":100,"y":272}')
    const { handle, toolbar } = setup()
    handle.focus()

    fireEvent.keyDown(handle, { key: 'ArrowDown' })

    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('ignores non-primary buttons', () => {
    const { handle, toolbar } = setup()

    fireEvent.pointerDown(handle, { button: 2, pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300, clientY: 300 })

    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
  })

  it('cancels a drag with Escape', () => {
    const { handle, toolbar } = setup()

    dragBy(handle, 50, 20)
    fireEvent.keyDown(handle, { key: 'Escape' })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400, clientY: 400 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 400, clientY: 400 })

    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBeNull()
  })

  it('restores the position when the browser cancels a drag', () => {
    const { handle, toolbar } = setup()

    dragBy(handle, 50, 20)
    fireEvent.pointerCancel(handle, { pointerId: 1 })

    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
  })

  it('moves with arrow keys, cancels with Escape, and saves on blur', () => {
    const { handle, toolbar } = setup()
    handle.focus()

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(toolbar.style.transform).toBe(
      `translate(${String(16 + KEYBOARD_STEP)}px, 140px)`,
    )
    fireEvent.keyDown(handle, { key: 'Escape' })
    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBeNull()
    fireEvent.blur(handle)
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBe(
      `{"x":16,"y":${String(140 + KEYBOARD_STEP)},"orientation":"vertical"}`,
    )
  })

  it('resets to the default and clears the saved position', () => {
    const { handle, reset, toolbar } = setup()
    expect(reset.disabled).toBe(true)

    dragBy(handle, 50, 20)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 120 })
    expect(reset.disabled).toBe(false)

    fireEvent.click(reset)

    expect(toolbar.style.transform).toBe(DEFAULT_TRANSFORM)
    expect(sessionStorage.getItem(TOOLBAR_POSITION_KEY)).toBeNull()
    expect(reset.disabled).toBe(true)
  })

  it('re-clamps after resize and returns when space comes back', () => {
    sessionStorage.setItem(TOOLBAR_POSITION_KEY, '{"x":700,"y":200}')
    const { parent, toolbar } = setup()
    expect(toolbar.style.transform).toBe('translate(700px, 200px)')

    setBounds(parent, 400, 600)
    expect(toolbar.style.transform).toBe('translate(346px, 200px)')

    setBounds(parent, BOUNDS.width, BOUNDS.height)
    expect(toolbar.style.transform).toBe('translate(700px, 200px)')
  })

  it('wraps controls instead of clipping them on short canvases', () => {
    const { parent, toolbar } = setup()

    setBounds(parent, 390, 200)

    expect(controls(toolbar).style.gridTemplateRows).toBe('repeat(4, 36px)')
  })

  it('does not select a tool while moving', () => {
    const { api, setActiveTool } = fakeApi()
    const { handle, reset } = setup(api)

    dragBy(handle, 50, 20)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 120 })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    fireEvent.click(reset)

    // The toolbar's API has no scene writer, and moving selects no tool.
    expect(setActiveTool).not.toHaveBeenCalled()
  })
})
