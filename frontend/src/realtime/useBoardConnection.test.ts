import { describe, expect, it } from 'vitest'
import { DEFAULT_BOARD_ID, getBoardId } from './useBoardConnection'

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
