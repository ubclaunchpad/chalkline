// Boards this browser opened, newest first. Local to the browser: there are
// no accounts in the prototype.
export const RECENT_BOARDS_KEY = 'chalkline.recentBoards'
export const MAX_RECENT_BOARDS = 12

export interface RecentBoard {
  id: string
  name: string
  lastOpened: number
}

function isRecentBoard(value: unknown): value is RecentBoard {
  if (typeof value !== 'object' || value === null) return false
  const board = value as Record<string, unknown>
  return (
    typeof board.id === 'string' &&
    board.id !== '' &&
    typeof board.name === 'string' &&
    typeof board.lastOpened === 'number'
  )
}

export function loadRecentBoards(
  storage: Storage = localStorage,
): RecentBoard[] {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(RECENT_BOARDS_KEY) ?? '[]',
    )
    return Array.isArray(parsed) ? parsed.filter(isRecentBoard) : []
  } catch {
    return []
  }
}

/** Moves the board to the top of the list with its latest name. */
export function recordBoardVisit(
  board: RecentBoard,
  storage: Storage = localStorage,
): void {
  const rest = loadRecentBoards(storage).filter(({ id }) => id !== board.id)
  try {
    storage.setItem(
      RECENT_BOARDS_KEY,
      JSON.stringify([board, ...rest].slice(0, MAX_RECENT_BOARDS)),
    )
  } catch {
    // Storage full or blocked: the list is a convenience, so skip it.
  }
}

/** A short random board id, e.g. "k3x9q2ma". */
export function newBoardId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')
}

export function boardUrl(id: string, template?: string): string {
  const params = new URLSearchParams({ board: id })
  if (template) params.set('template', template)
  return `?${params.toString()}`
}
