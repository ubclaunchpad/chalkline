// Prototype persistence: boards live in this browser's localStorage only.
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export type BoardMeta = { id: string; name: string; updatedAt: number }

const INDEX_KEY = 'chalkline:boards'
const boardKey = (id: string) => `chalkline:board:${id}`

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked; the prototype keeps working in memory.
  }
}

export function listBoards(): BoardMeta[] {
  return read<BoardMeta[]>(INDEX_KEY, []).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  )
}

export function getBoardMeta(id: string): BoardMeta | undefined {
  return listBoards().find((b) => b.id === id)
}

export function saveBoardMeta(meta: BoardMeta) {
  write(INDEX_KEY, [meta, ...listBoards().filter((b) => b.id !== meta.id)])
}

export function loadElements(id: string): ExcalidrawElement[] {
  return read<ExcalidrawElement[]>(boardKey(id), [])
}

export function saveElements(
  id: string,
  elements: readonly ExcalidrawElement[],
) {
  write(
    boardKey(id),
    elements.filter((e) => !e.isDeleted),
  )
  const meta = getBoardMeta(id)
  if (meta) saveBoardMeta({ ...meta, updatedAt: Date.now() })
}

export function deleteBoard(id: string) {
  try {
    localStorage.removeItem(boardKey(id))
  } catch {
    // ignore
  }
  write(
    INDEX_KEY,
    listBoards().filter((b) => b.id !== id),
  )
}
