import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

// Browser -> Server
export type ClientMessage =
  | { type: 'change'; elements: readonly OrderedExcalidrawElement[] }
  | { type: 'cursor'; x: number; y: number; name: string; color: string }

// Server -> Browser
// The server adds `from` to every change and cursor it passes on.
export type ServerMessage =
  | { type: 'welcome'; clientId: string }
  | {
      type: 'change'
      from: string
      elements: readonly OrderedExcalidrawElement[]
    }
  | {
      type: 'cursor'
      from: string
      x: number
      y: number
      name: string
      color: string
    }
  | { type: 'leave'; clientId: string }
  | { type: 'error'; message: string }

export type ServerMessageType = ServerMessage['type']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseServerMessage(text: string): ServerMessage | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null // not valid JSON
  }
  if (!isRecord(data)) return null // e.g. "42", "null", "[]"

  switch (data.type) {
    case 'welcome':
      if (typeof data.clientId !== 'string') return null
      return { type: 'welcome', clientId: data.clientId }

    case 'change':
      if (typeof data.from !== 'string' || !Array.isArray(data.elements)) {
        return null
      }
      // We check it's an array but trust the server for the element contents.
      return {
        type: 'change',
        from: data.from,
        elements: data.elements as readonly OrderedExcalidrawElement[],
      }

    case 'cursor':
      if (
        typeof data.from !== 'string' ||
        typeof data.x !== 'number' ||
        typeof data.y !== 'number' ||
        typeof data.name !== 'string' ||
        typeof data.color !== 'string'
      ) {
        return null
      }
      return {
        type: 'cursor',
        from: data.from,
        x: data.x,
        y: data.y,
        name: data.name,
        color: data.color,
      }

    case 'leave':
      if (typeof data.clientId !== 'string') return null
      return { type: 'leave', clientId: data.clientId }

    case 'error':
      if (typeof data.message !== 'string') return null
      return { type: 'error', message: data.message }

    default:
      return null // unknown or missing type
  }
}
