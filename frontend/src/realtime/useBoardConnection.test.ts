import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BOARD_ID,
  getBoardId,
  syncBoardIdToUrl,
} from './useBoardConnection'

describe('getBoardId', () => {
  it('reads the board from the address', () => {
    expect(getBoardId('?board=abc')).toBe('abc')
  })

  it('ignores other query parameters', () => {
    expect(getBoardId('?view=grid&board=abc&zoom=2')).toBe('abc')
  })

  it('decodes encoded board ids', () => {
    expect(getBoardId('?board=team%20board')).toBe('team board')
  })

  it('uses the first board when the parameter repeats', () => {
    expect(getBoardId('?board=abc&board=xyz')).toBe('abc')
  })

  it('falls back to demo when the board is missing', () => {
    expect(getBoardId('')).toBe(DEFAULT_BOARD_ID)
    expect(getBoardId('?view=grid')).toBe(DEFAULT_BOARD_ID)
  })

  it('falls back to demo when the board is empty', () => {
    expect(getBoardId('?board=')).toBe(DEFAULT_BOARD_ID)
  })

  it('accepts a search string without the leading ?', () => {
    expect(getBoardId('board=abc')).toBe('abc')
  })
})

describe('syncBoardIdToUrl', () => {
  const historyState = { from: 'router' }

  // Stands in for the browser's window so these tests need no DOM.
  function stubWindow(href: string) {
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: { href },
      history: { state: historyState, replaceState },
    })
    return replaceState
  }

  function replacedUrl(replaceState: ReturnType<typeof vi.fn>): URL {
    return new URL(String(replaceState.mock.calls[0][2]))
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds the default board when the board is missing', () => {
    const replaceState = stubWindow('http://localhost:5173/')

    expect(syncBoardIdToUrl()).toBe(DEFAULT_BOARD_ID)

    expect(replaceState).toHaveBeenCalledOnce()
    expect(replacedUrl(replaceState).search).toBe('?board=demo')
  })

  it('replaces an empty board with the default board', () => {
    const replaceState = stubWindow('http://localhost:5173/?board=')

    expect(syncBoardIdToUrl()).toBe(DEFAULT_BOARD_ID)

    expect(replaceState).toHaveBeenCalledOnce()
    expect(replacedUrl(replaceState).search).toBe('?board=demo')
  })

  it('keeps other query parameters', () => {
    const replaceState = stubWindow('http://localhost:5173/?view=grid&zoom=2')

    syncBoardIdToUrl()

    const params = replacedUrl(replaceState).searchParams
    expect(params.get('view')).toBe('grid')
    expect(params.get('zoom')).toBe('2')
    expect(params.get('board')).toBe('demo')
  })

  it('leaves the address alone when the board is already there', () => {
    const replaceState = stubWindow('http://localhost:5173/?board=abc')

    expect(syncBoardIdToUrl()).toBe('abc')

    expect(replaceState).not.toHaveBeenCalled()
  })

  it('keeps the state attached to the history entry', () => {
    const replaceState = stubWindow('http://localhost:5173/')

    syncBoardIdToUrl()

    expect(replaceState.mock.calls[0][0]).toBe(historyState)
  })
})
