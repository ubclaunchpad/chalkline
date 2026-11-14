// @vitest-environment jsdom
import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentData } from '../catalog/catalog.ts'
import { changedElements } from '../realtime/sceneSync.ts'
import { useComponentPanel, type PanelApi } from './useComponentPanel.ts'

// The real package needs a browser canvas to load, so stand in for it.
// newElementWith copies the element, applies the updates and bumps the
// version. convertToExcalidrawElements is set per test where a rename needs
// the label "measured".
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

type RectangleElement = Extract<OrderedExcalidrawElement, { type: 'rectangle' }>
type TextElement = Extract<OrderedExcalidrawElement, { type: 'text' }>

const database: ComponentData = {
  v: 1,
  kind: 'database',
  name: 'Users DB',
  props: { engine: 'PostgreSQL', replicas: 1 },
}

const cache: ComponentData = {
  v: 1,
  kind: 'cache',
  name: 'Session cache',
  props: { engine: 'Redis', strategy: 'Cache-aside', ttlSeconds: 300 },
}

const base = {
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
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  updated: 1,
  link: null,
  locked: false,
} as const

const box = ({
  id,
  customData,
  x = 0,
  version = 1,
  labelId = null,
}: {
  id: string
  customData?: Record<string, unknown>
  x?: number
  version?: number
  labelId?: string | null
}): RectangleElement => ({
  ...base,
  id,
  type: 'rectangle',
  x,
  version,
  index: `a-${id}` as RectangleElement['index'],
  boundElements: labelId ? [{ id: labelId, type: 'text' }] : null,
  customData,
})

const label = ({
  id,
  containerId,
  text,
}: {
  id: string
  containerId: string
  text: string
}): TextElement => ({
  ...base,
  id,
  type: 'text',
  x: 0,
  version: 1,
  index: `b-${id}` as TextElement['index'],
  boundElements: null,
  fontSize: 20,
  fontFamily: 5,
  text,
  originalText: text,
  textAlign: 'center',
  verticalAlign: 'middle',
  containerId,
  autoResize: true,
  lineHeight: 1.25 as TextElement['lineHeight'],
})

// A database box with its label, a cache, and a plain rectangle.
const dbBox = box({ id: 'db', customData: database, labelId: 'db-label' })
const dbLabel = label({
  id: 'db-label',
  containerId: 'db',
  text: 'Users DB\ndatabase',
})
const cacheBox = box({ id: 'cache', customData: cache })
const plainBox = box({ id: 'plain' })
const board = [dbBox, dbLabel, cacheBox, plainBox]

// A fake Excalidraw API holding a scene that updateScene replaces.
function fakeApi(initial: readonly OrderedExcalidrawElement[]) {
  let scene = initial
  const updateScene = vi.fn(
    ({ elements }: { elements: readonly OrderedExcalidrawElement[] }) => {
      scene = elements
    },
  )
  const api = {
    getSceneElementsIncludingDeleted: () => scene,
    updateScene,
  } as unknown as PanelApi

  return {
    api,
    updateScene,
    setScene(elements: readonly OrderedExcalidrawElement[]) {
      scene = elements
    },
    // The elements passed to the first updateScene call.
    savedScene(): readonly OrderedExcalidrawElement[] {
      return updateScene.mock.calls[0][0].elements
    },
  }
}

// Renders the hook and selects the given element ids on the given scene.
function renderPanel(
  fake: ReturnType<typeof fakeApi>,
  selected: string[],
  elements: readonly OrderedExcalidrawElement[] = board,
) {
  const hook = renderHook(() => useComponentPanel(fake.api))
  select(hook, selected, elements)
  return hook
}

function select(
  hook: { result: { current: ReturnType<typeof useComponentPanel> } },
  ids: string[],
  elements: readonly OrderedExcalidrawElement[] = board,
) {
  act(() => {
    hook.result.current.onSceneChange(elements, {
      selectedElementIds: Object.fromEntries(
        ids.map((id) => [id, true] as const),
      ),
    })
  })
}

beforeEach(() => {
  vi.mocked(convertToExcalidrawElements).mockReset()
})

afterEach(() => {
  cleanup()
})

describe('useComponentPanel selection', () => {
  it('selects a single component with its data', () => {
    const { result } = renderPanel(fakeApi(board), ['db'])

    expect(result.current.selection).toMatchObject({
      elementKey: 'db-1',
      data: database,
    })
  })

  it.each([
    ['nothing', []],
    ['a plain shape', ['plain']],
    ['several components', ['db', 'cache']],
  ])('hides the panel when %s is selected', (_, ids) => {
    const { result } = renderPanel(fakeApi(board), ids)

    expect(result.current.selection).toBeNull()
  })

  it('keeps the same selection object when nothing relevant changed', () => {
    const hook = renderPanel(fakeApi(board), ['db'])
    const first = hook.result.current.selection

    // e.g. a pointer move: Excalidraw calls onChange, but the box is the same.
    select(hook, ['db'])

    expect(hook.result.current.selection).toBe(first)
  })

  it('refreshes when the selected component gets a new version', () => {
    const hook = renderPanel(fakeApi(board), ['db'])
    const first = hook.result.current.selection

    // e.g. someone else edited it and the change synced in.
    const edited = box({
      id: 'db',
      customData: { ...database, props: { engine: 'MySQL', replicas: 1 } },
      labelId: 'db-label',
      version: 2,
    })
    select(hook, ['db'], [edited, dbLabel, cacheBox, plainBox])

    expect(hook.result.current.selection).not.toBe(first)
    expect(hook.result.current.selection).toMatchObject({
      elementKey: 'db-2',
      data: { props: { engine: 'MySQL' } },
    })
  })
})

describe('useComponentPanel save', () => {
  it('saves a valid change so scene sync sends only that box', () => {
    const fake = fakeApi(board)
    const { result } = renderPanel(fake, ['db'])

    act(() => {
      result.current.save({ props: { engine: 'MySQL' } })
    })

    expect(fake.updateScene).toHaveBeenCalledTimes(1)
    const saved = fake.savedScene()
    expect(changedElements(board, saved).map((el) => el.id)).toEqual(['db'])
    expect(saved[0].customData).toEqual({
      ...database,
      props: { engine: 'MySQL', replicas: 1 },
    })
  })

  it('shows errors for an invalid change and saves nothing', () => {
    const fake = fakeApi(board)
    const { result } = renderPanel(fake, ['db'])

    act(() => {
      result.current.save({ props: { replicas: 0 } })
    })

    expect(result.current.errors).toEqual({
      replicas: 'replicas must be at least 1',
    })
    expect(fake.updateScene).not.toHaveBeenCalled()
  })

  it("does not show one component's errors on another", () => {
    const hook = renderPanel(fakeApi(board), ['db'])

    act(() => {
      hook.result.current.save({ props: { replicas: 0 } })
    })
    select(hook, ['cache'])

    expect(hook.result.current.errors).toEqual({})
  })

  it('does not bring old errors back when a component is selected again', () => {
    const hook = renderPanel(fakeApi(board), ['db'])

    act(() => {
      hook.result.current.save({ props: { replicas: 0 } })
    })
    // Leaving and coming back resets the inputs to the saved values, so the
    // error about the rejected value no longer applies.
    select(hook, ['cache'])
    select(hook, ['db'])

    expect(hook.result.current.errors).toEqual({})
  })

  it('clears errors after a valid save', () => {
    const { result } = renderPanel(fakeApi(board), ['db'])

    act(() => {
      result.current.save({ props: { replicas: 0 } })
    })
    act(() => {
      result.current.save({ props: { replicas: 2 } })
    })

    expect(result.current.errors).toEqual({})
  })

  it('does not update the scene when nothing changed', () => {
    const fake = fakeApi(board)
    const { result } = renderPanel(fake, ['db'])

    act(() => {
      result.current.save({ props: { engine: 'PostgreSQL' } })
    })

    expect(fake.updateScene).not.toHaveBeenCalled()
  })

  it('renames the box and its label in one update', () => {
    vi.mocked(convertToExcalidrawElements).mockReturnValue([
      box({ id: 'throwaway-box' }),
      label({
        id: 'throwaway-label',
        containerId: 'throwaway-box',
        text: 'Orders DB\ndatabase',
      }),
    ])
    const fake = fakeApi(board)
    const { result } = renderPanel(fake, ['db'])

    act(() => {
      result.current.save({ name: 'Orders DB' })
    })

    expect(fake.updateScene).toHaveBeenCalledTimes(1)
    const saved = fake.savedScene()
    // Both the box and its label are sent, and nothing else.
    expect(changedElements(board, saved).map((el) => el.id)).toEqual([
      'db',
      'db-label',
    ])
    expect(saved[1]).toMatchObject({
      id: 'db-label',
      text: 'Orders DB\ndatabase',
    })
  })

  it('keeps a move that synced in after the box was selected', () => {
    const fake = fakeApi(board)
    const { result } = renderPanel(fake, ['db'])

    // Someone else moves the box; the panel's selection still has the old copy.
    const moved = box({
      id: 'db',
      customData: database,
      labelId: 'db-label',
      x: 500,
      version: 2,
    })
    fake.setScene([moved, dbLabel, cacheBox, plainBox])

    act(() => {
      result.current.save({ props: { engine: 'MySQL' } })
    })

    expect(fake.savedScene()[0]).toMatchObject({ id: 'db', x: 500 })
  })
})
