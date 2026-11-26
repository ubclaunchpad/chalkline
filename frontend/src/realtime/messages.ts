import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export type Access = 'edit' | 'view'

// Share keys. Only connections with edit access receive them.
export interface BoardKeys {
  edit: string
  view: string
}

// Browser -> Server
export type ClientMessage =
  | { type: 'change'; elements: readonly OrderedExcalidrawElement[] }
  | {
      type: 'cursor'
      x: number
      y: number
      name: string
      color: string
      // What this person has selected, so others can outline it in their colour.
      selectedElementIds?: readonly string[]
    }

// Server -> Browser
// The server adds `from` to every change and cursor it passes on.
export type ServerMessage =
  // access and keys are missing when the server does not check share keys.
  | { type: 'welcome'; clientId: string; access?: Access; keys?: BoardKeys }
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
      selectedElementIds?: readonly string[]
    }
  // Every element the room holds, deleted ones included. Sent once on join.
  | { type: 'snapshot'; elements: readonly OrderedExcalidrawElement[] }
  | { type: 'leave'; clientId: string }
  // Everyone connected to the room, including you. Order has no meaning.
  | { type: 'participants'; clientIds: readonly string[] }
  | { type: 'error'; code?: string; message: string }

export type ServerMessageType = ServerMessage['type']

// Outlining more than this many remote selections adds nothing visible.
const MAX_SELECTED = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
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
    case 'welcome': {
      if (typeof data.clientId !== 'string') return null
      const welcome: Extract<ServerMessage, { type: 'welcome' }> = {
        type: 'welcome',
        clientId: data.clientId,
      }
      if (data.access === 'edit' || data.access === 'view') {
        welcome.access = data.access
      }
      const keys = data.keys
      if (
        isRecord(keys) &&
        typeof keys.edit === 'string' &&
        typeof keys.view === 'string'
      ) {
        welcome.keys = { edit: keys.edit, view: keys.view }
      }
      return welcome
    }

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
        // Older clients send no selection; a bad one is ignored, not fatal.
        ...(isStringArray(data.selectedElementIds) && {
          selectedElementIds: data.selectedElementIds.slice(0, MAX_SELECTED),
        }),
      }

    case 'snapshot':
      if (!Array.isArray(data.elements)) return null
      return {
        type: 'snapshot',
        elements: data.elements as readonly OrderedExcalidrawElement[],
      }

    case 'leave':
      if (typeof data.clientId !== 'string') return null
      return { type: 'leave', clientId: data.clientId }

    case 'participants':
      // The server always includes the recipient and lists each client once.
      if (
        !isStringArray(data.clientIds) ||
        data.clientIds.length === 0 ||
        new Set(data.clientIds).size !== data.clientIds.length
      ) {
        return null
      }
      return { type: 'participants', clientIds: data.clientIds }

    case 'error':
      if (typeof data.message !== 'string') return null
      return typeof data.code === 'string'
        ? { type: 'error', code: data.code, message: data.message }
        : { type: 'error', message: data.message }

    default:
      return null // unknown or missing type
  }
}
