import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { describe, expect, it } from 'vitest'
import { boardName, drawableElements, fileStem, replaceScene } from './scene'

const el = (
  id: string,
  version = 1,
  extra: Partial<ExcalidrawElement> = {},
): ExcalidrawElement =>
  ({
    id,
    version,
    versionNonce: 1,
    isDeleted: false,
    ...extra,
  }) as ExcalidrawElement

const info = (id: string, name: string) =>
  el(id, 1, { customData: { v: 1, annotation: 'board', name } })

describe('boardName', () => {
  it('reads the board-info element and falls back to the id', () => {
    expect(boardName([el('a'), info('b', ' Shop ')], 'x')).toBe('Shop')
    expect(boardName([el('a')], 'test1')).toBe('test1')
    expect(boardName([info('b', '')], 'test1')).toBe('test1')
  })
})

describe('fileStem', () => {
  it('removes characters files cannot hold', () => {
    expect(fileStem('A/B: "c"?')).toBe('A-B- -c')
    expect(fileStem('...')).toBe('chalkline-board')
    expect(fileStem('My board')).toBe('My board')
  })
})

describe('drawableElements', () => {
  it('drops deleted elements and the off-canvas board info', () => {
    const result = drawableElements([
      el('a'),
      el('b', 1, { isDeleted: true }),
      info('c', 'Shop'),
    ])
    expect(result.map((e) => e.id)).toEqual(['a'])
  })
})

describe('replaceScene', () => {
  it('bumps loaded elements above local versions and deletes the rest', () => {
    const next = replaceScene(
      [el('keep', 7), el('gone', 3), el('old', 2, { isDeleted: true })],
      [el('keep', 1), el('new', 4)],
    )
    const byId = new Map(next.map((e) => [e.id, e]))
    expect(byId.get('keep')?.version).toBe(8)
    expect(byId.get('keep')?.isDeleted).toBe(false)
    expect(byId.get('new')?.version).toBe(5)
    expect(byId.get('gone')).toMatchObject({ isDeleted: true, version: 4 })
    expect(byId.has('old')).toBe(false)
  })

  it("keeps this board's name unless the file has its own", () => {
    const current = [info('name', 'Mine')]
    expect(
      replaceScene(current, [el('a')]).find((e) => e.id === 'name'),
    ).toMatchObject({
      isDeleted: false,
    })
    const replaced = replaceScene(current, [info('other', 'Theirs')])
    expect(replaced.find((e) => e.id === 'name')?.isDeleted).toBe(true)
    expect(boardName(replaced, 'x')).toBe('Theirs')
  })
})
