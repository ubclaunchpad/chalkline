import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

// The board-info element (see docs/prototype/CONVENTIONS.md): one hidden,
// locked 1×1 rectangle whose customData holds the board name. It sits at the
// origin so Excalidraw's own "fit to content" (Shift+1) doesn't zoom out to it.
export const BOARD_INFO_POSITION = 0
export const MAX_BOARD_NAME_LENGTH = 80

export function isBoardInfo(element: ExcalidrawElement): boolean {
  return !element.isDeleted && element.customData?.annotation === 'board'
}

/** Anything a person can see on the board (everything but board info). */
export function isOnCanvas(element: ExcalidrawElement): boolean {
  return !element.isDeleted && !isBoardInfo(element)
}

export function findBoardInfo(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | undefined {
  return elements.find(isBoardInfo)
}

/** The board's name from its info element, or the board id. */
export function boardNameFrom(
  elements: readonly ExcalidrawElement[],
  boardId: string,
): string {
  const name: unknown = findBoardInfo(elements)?.customData?.name
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : boardId
}

/** Trims a typed name; null means "keep the old one". */
export function cleanBoardName(input: string): string | null {
  const name = input.replace(/\s+/g, ' ').trim()
  return name === '' ? null : name.slice(0, MAX_BOARD_NAME_LENGTH)
}
