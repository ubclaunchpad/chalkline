// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  boardUrl,
  loadRecentBoards,
  MAX_RECENT_BOARDS,
  newBoardId,
  RECENT_BOARDS_KEY,
  recordBoardVisit,
} from './recentBoards'

afterEach(() => {
  localStorage.clear()
})

describe('recent boards', () => {
  it('records visits newest first without duplicates', () => {
    recordBoardVisit({ id: 'a', name: 'A', lastOpened: 1 })
    recordBoardVisit({ id: 'b', name: 'B', lastOpened: 2 })
    recordBoardVisit({ id: 'a', name: 'A renamed', lastOpened: 3 })
    expect(loadRecentBoards()).toEqual([
      { id: 'a', name: 'A renamed', lastOpened: 3 },
      { id: 'b', name: 'B', lastOpened: 2 },
    ])
  })

  it('keeps only the most recent boards', () => {
    for (let i = 0; i < MAX_RECENT_BOARDS + 3; i++) {
      recordBoardVisit({ id: `b${String(i)}`, name: 'x', lastOpened: i })
    }
    expect(loadRecentBoards()).toHaveLength(MAX_RECENT_BOARDS)
  })

  it('ignores broken or foreign data', () => {
    localStorage.setItem(RECENT_BOARDS_KEY, '{not json')
    expect(loadRecentBoards()).toEqual([])
    localStorage.setItem(
      RECENT_BOARDS_KEY,
      JSON.stringify([
        { id: 'ok', name: 'Ok', lastOpened: 1 },
        { id: 2 },
        null,
      ]),
    )
    expect(loadRecentBoards()).toEqual([
      { id: 'ok', name: 'Ok', lastOpened: 1 },
    ])
  })
})

describe('board links', () => {
  it('makes short url-safe ids', () => {
    const id = newBoardId()
    expect(id).toMatch(/^[0-9a-z]{8}$/)
    expect(newBoardId()).not.toBe(id)
  })

  it('adds the template only when one is chosen', () => {
    expect(boardUrl('abc')).toBe('?board=abc')
    expect(boardUrl('abc', 'three-tier')).toBe('?board=abc&template=three-tier')
  })
})
