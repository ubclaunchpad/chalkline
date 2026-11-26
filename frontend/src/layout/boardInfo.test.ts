import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import {
  boardNameFrom,
  cleanBoardName,
  isOnCanvas,
  MAX_BOARD_NAME_LENGTH,
} from './boardInfo'

const element = (
  customData?: Record<string, unknown>,
  isDeleted = false,
): ExcalidrawElement =>
  ({ id: 'e', type: 'rectangle', isDeleted, customData }) as ExcalidrawElement

describe('boardNameFrom', () => {
  it('reads the name from the board-info element', () => {
    const elements = [element(), element({ annotation: 'board', name: 'Shop' })]
    expect(boardNameFrom(elements, 'abc')).toBe('Shop')
  })

  it('falls back to the board id when there is no usable name', () => {
    expect(boardNameFrom([], 'abc')).toBe('abc')
    expect(boardNameFrom([element({ annotation: 'board' })], 'abc')).toBe('abc')
    expect(
      boardNameFrom([element({ annotation: 'board', name: '  ' })], 'abc'),
    ).toBe('abc')
    expect(
      boardNameFrom([element({ annotation: 'board', name: 'x' }, true)], 'abc'),
    ).toBe('abc')
  })
})

describe('cleanBoardName', () => {
  it('collapses whitespace and rejects empty names', () => {
    expect(cleanBoardName('  my   board ')).toBe('my board')
    expect(cleanBoardName('   ')).toBeNull()
  })

  it('caps the length', () => {
    expect(cleanBoardName('a'.repeat(200))).toHaveLength(MAX_BOARD_NAME_LENGTH)
  })
})

describe('isOnCanvas', () => {
  it('hides board info and deleted elements', () => {
    expect(isOnCanvas(element())).toBe(true)
    expect(isOnCanvas(element({ annotation: 'board' }))).toBe(false)
    expect(isOnCanvas(element({ annotation: 'sticky' }))).toBe(true)
    expect(isOnCanvas(element(undefined, true))).toBe(false)
  })
})
