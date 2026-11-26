// Practice progress for one board, kept in this browser's localStorage.

export interface Progress {
  exerciseId: string
  /** Time on the clock before the current run. */
  elapsedMs: number
  /** When the timer was last started, or null while paused. */
  runningSince: number | null
  hintsShown: number
}

const key = (boardId: string) => `chalkline:practice:${boardId}`

export function loadProgress(boardId: string): Progress | null {
  try {
    const raw = localStorage.getItem(key(boardId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Progress>
    if (
      typeof value.exerciseId !== 'string' ||
      typeof value.elapsedMs !== 'number' ||
      typeof value.hintsShown !== 'number' ||
      !(value.runningSince === null || typeof value.runningSince === 'number')
    ) {
      return null
    }
    return value as Progress
  } catch {
    return null
  }
}

export function saveProgress(boardId: string, progress: Progress | null) {
  try {
    if (progress) localStorage.setItem(key(boardId), JSON.stringify(progress))
    else localStorage.removeItem(key(boardId))
  } catch {
    // Storage can be full or blocked; practice still works for this visit.
  }
}

export function elapsed(progress: Progress, now: number): number {
  return (
    progress.elapsedMs +
    (progress.runningSince === null ? 0 : now - progress.runningSince)
  )
}

/** Starts or pauses the timer. */
export function toggleTimer(progress: Progress, now: number): Progress {
  return progress.runningSince === null
    ? { ...progress, runningSince: now }
    : { ...progress, elapsedMs: elapsed(progress, now), runningSince: null }
}

/** "m:ss", or "h:mm:ss" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h.toString()}:${pad(m)}:${pad(s)}`
    : `${m.toString()}:${pad(s)}`
}
