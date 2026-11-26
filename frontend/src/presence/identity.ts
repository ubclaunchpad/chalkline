export const IDENTITY_KEY = 'chalkline.displayName'
// The five design pastels: blue, teal, amber, pink, violet. Light enough to
// keep Excalidraw's dark cursor-name text readable on the name tag.
export const COLORS = [
  '#a5c4f7',
  '#8ad9cf',
  '#f5cf7f',
  '#f5a9cb',
  '#c4b0f7',
] as const

export interface Identity {
  name: string
  color: string
}

export function colorForName(name: string): string {
  let hash = 0
  for (const character of name) {
    hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0
  }
  return COLORS[hash % COLORS.length]
}

export function createIdentity(name: string): Identity {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Enter a display name')
  return { name: trimmed, color: colorForName(trimmed) }
}

export function guestName(): string {
  return `Guest${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')}`
}

export function loadIdentity(): Identity | null {
  try {
    const name = window.localStorage.getItem(IDENTITY_KEY)
    return name?.trim() ? createIdentity(name) : null
  } catch {
    return null
  }
}

// Storage can be unavailable in private/restricted contexts. Keep the chosen
// identity for this visit even when it cannot be persisted.
export function saveIdentity(identity: Identity): void {
  try {
    window.localStorage.setItem(IDENTITY_KEY, identity.name)
  } catch {
    // The dialog remains usable without storage.
  }
}
