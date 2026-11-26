// Share keys for boards. A key in the address bar wins; otherwise we use an
// edit key this browser was given earlier, so the board's creator keeps edit
// access when they come back from the home page.

const storageKey = (boardId: string) => `chalkline.editKey.${boardId}`
// Used only when storage is unavailable, so keys last for this visit.
const remembered = new Map<string, string>()

export function boardKey(
  boardId: string,
  search = window.location.search,
): string | null {
  const fromUrl = new URLSearchParams(search).get('key')
  if (fromUrl) return fromUrl
  try {
    return window.localStorage.getItem(storageKey(boardId))
  } catch {
    return remembered.get(boardId) ?? null
  }
}

// Only edit keys are remembered: storing a view key would downgrade a creator
// who opens their own view link in this browser.
export function rememberEditKey(boardId: string, key: string): void {
  try {
    window.localStorage.setItem(storageKey(boardId), key)
  } catch {
    remembered.set(boardId, key)
  }
}

/**
 * Socket parameters for the next connection attempt. With no key, the browser
 * proposes its own edit key (`claim`) and saves it first: if the board is new,
 * the server adopts it, so a connection dropped before `welcome` (React Strict
 * Mode does this) cannot leave the creator without their key.
 */
export function socketParams(
  boardId: string,
  search = window.location.search,
): Record<string, string> {
  const key = boardKey(boardId, search)
  if (key) return { key }
  const claim = crypto.randomUUID().replaceAll('-', '')
  rememberEditKey(boardId, claim)
  return { claim }
}

/** The link that opens `boardId` with `key`, on this page's origin. */
export function shareLink(boardId: string, key: string): string {
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set('board', boardId)
  url.searchParams.set('key', key)
  return url.toString()
}
