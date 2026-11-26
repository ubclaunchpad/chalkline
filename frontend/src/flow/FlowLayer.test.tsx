// @vitest-environment jsdom
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardContext, type BoardContextValue } from '../app/context'
import { component, healthyBoard } from '../checks/testBoard'
import { FlowLayer } from '.'

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { NEVER: 'NEVER' },
}))

function renderWith(elements: unknown[], selected: string[]) {
  const api = {
    getSceneElements: () => elements,
    getAppState: () => ({
      selectedElementIds: Object.fromEntries(selected.map((id) => [id, true])),
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
    }),
    onChange: () => () => undefined,
    onScrollChange: () => () => undefined,
  } as unknown as ExcalidrawImperativeAPI
  const board: BoardContextValue = {
    api,
    boardId: 'test',
    access: 'edit',
    setAccess: vi.fn(),
    panel: null,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    togglePanel: vi.fn(),
  }
  vi.useFakeTimers()
  render(
    <BoardContext value={board}>
      <FlowLayer />
    </BoardContext>,
  )
  // Let the settled graph catch up.
  act(() => {
    vi.advanceTimersByTime(300)
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('FlowLayer', () => {
  it('sends a request from the selected component and can stop it', () => {
    renderWith(healthyBoard(), ['client'])
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByRole('status').textContent).toBe(
      'Request from Web app reaches 4 components.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy()
  })

  it('says so when nothing is connected', () => {
    renderWith([component('cache', 'cache', 'Redis')], ['cache'])
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByRole('status').textContent).toBe(
      'Nothing is connected from Redis yet.',
    )
  })

  it('shows no button for plain shapes or no selection', () => {
    renderWith(healthyBoard(), [])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
