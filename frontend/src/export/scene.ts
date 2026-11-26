// Scene helpers for export and "Open file". Pure, so they can be tested
// without Excalidraw.

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

const isBoardInfo = (element: ExcalidrawElement) =>
  (element.customData as { annotation?: unknown } | undefined)?.annotation ===
  'board'

/** The board's display name, from the hidden board-info element. */
export function boardName(
  elements: readonly ExcalidrawElement[],
  fallback: string,
): string {
  const info = elements.find((e) => !e.isDeleted && isBoardInfo(e))
  const name = (info?.customData as { name?: unknown } | undefined)?.name
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : fallback
}

/** A name safe to save as a file on any OS. */
export function fileStem(name: string): string {
  const stem = name
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
  return stem || 'chalkline-board'
}

/**
 * Elements drawn in an image export. The board-info element sits far
 * off-canvas, so including it would make the image enormous.
 */
export function drawableElements(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  return elements.filter((e) => !e.isDeleted && !isBoardInfo(e))
}

const nonce = () => Math.floor(Math.random() * 2 ** 31)

/**
 * The scene after replacing `current` with `loaded`. Every element gets a
 * version above any it had here, so the sync sends it and other people's
 * copies accept it; anything not in the file is deleted the same way. The
 * board's name is kept unless the file brings its own.
 */
export function replaceScene(
  current: readonly ExcalidrawElement[],
  loaded: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const before = new Map(current.map((e) => [e.id, e]))
  const loadedIds = new Set(loaded.map((e) => e.id))
  const keepBoardInfo = !loaded.some(isBoardInfo)
  const next = loaded.map((e) => ({
    ...e,
    version: Math.max(e.version, before.get(e.id)?.version ?? 0) + 1,
    versionNonce: nonce(),
  }))
  for (const e of current) {
    if (loadedIds.has(e.id) || e.isDeleted) continue
    if (keepBoardInfo && isBoardInfo(e)) {
      next.push(e)
      continue
    }
    next.push({
      ...e,
      isDeleted: true,
      version: e.version + 1,
      versionNonce: nonce(),
    })
  }
  return next
}
