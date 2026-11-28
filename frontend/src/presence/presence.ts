import type {
  Collaborator,
  ExcalidrawProps,
  SocketId,
} from '@excalidraw/excalidraw/types'
import type { ClientMessage, ServerMessage } from '../realtime/messages'
import type { Identity } from './identity'
import { COLORS, colorForName } from './identity'

// Subset of #27's shared connection. No socket is owned by presence.
export interface PresenceConnection {
  send: (message: ClientMessage) => void
  on<T extends ServerMessage['type']>(
    type: T,
    handler: (message: Extract<ServerMessage, { type: T }>) => void,
  ): () => void
  status(): 'connecting' | 'open' | 'closed'
  onStatus(
    handler: (status: 'connecting' | 'open' | 'closed') => void,
  ): () => void
  clientId(): string | null
}

export interface Participant extends Identity {
  cursor: Cursor | null
}

interface Cursor {
  x: number
  y: number
  lastSeen: number
}

export const CURSOR_INTERVAL_MS = 67 // ceil(1000 / 15), never above 15/s
export const INACTIVITY_MS = 10000
type Pointer = Parameters<
  NonNullable<ExcalidrawProps['onPointerUpdate']>
>[0]['pointer']

export function toCollaborators(
  participants: ReadonlyMap<string, Participant>,
) {
  const collaborators = new Map<SocketId, Collaborator>()
  for (const [clientId, participant] of participants) {
    const cursor = participant.cursor
    if (!cursor) continue
    collaborators.set(clientId as SocketId, {
      username: participant.name,
      color: { background: participant.color, stroke: participant.color },
      pointer: { x: cursor.x, y: cursor.y, tool: 'pointer' },
    })
  }
  return collaborators
}

export function startPresence(
  connection: PresenceConnection,
  identity: Identity | null,
  onChange: (participants: ReadonlyMap<string, Participant>) => void,
) {
  let currentIdentity = identity
  const participants = new Map<string, Participant>()
  let disposed = false
  let lastSent: { x: number; y: number } | undefined
  let pending: { x: number; y: number } | undefined
  let lastSentAt = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const publish = () => {
    onChange(new Map(participants))
  }
  const placeholder = (clientId: string): Participant => {
    const name = `Guest ${clientId.slice(-4)}`
    return { name, color: colorForName(name), cursor: null }
  }
  publish()
  const scheduleExpiry = () => {
    clearTimeout(expiryTimer)
    if (disposed || !participants.size) return
    let nextExpiry = Infinity
    for (const participant of participants.values()) {
      if (participant.cursor)
        nextExpiry = Math.min(
          nextExpiry,
          participant.cursor.lastSeen + INACTIVITY_MS,
        )
    }
    if (nextExpiry === Infinity) return
    expiryTimer = setTimeout(
      () => {
        if (disposed) return
        const now = performance.now()
        for (const [clientId, participant] of participants) {
          if (
            participant.cursor &&
            now - participant.cursor.lastSeen >= INACTIVITY_MS
          ) {
            participants.set(clientId, { ...participant, cursor: null })
          }
        }
        publish()
        scheduleExpiry()
      },
      Math.max(0, nextExpiry - performance.now()),
    )
  }
  const reset = () => {
    clearTimeout(timer)
    clearTimeout(expiryTimer)
    timer = undefined
    pending = undefined
    lastSent = undefined
    lastSentAt = -Infinity
    if (participants.size) {
      participants.clear()
      publish()
    }
  }
  const flush = () => {
    timer = undefined
    if (disposed || !pending) return
    const point = pending
    pending = undefined
    if (
      connection.status() !== 'open' ||
      !connection.clientId() ||
      !currentIdentity
    )
      return
    if (lastSent?.x === point.x && lastSent.y === point.y) return
    connection.send({ type: 'cursor', ...point, ...currentIdentity })
    lastSent = point
    lastSentAt = performance.now()
  }
  const unsubscribe = [
    connection.on('participants', ({ clientIds }) => {
      if (disposed) return
      const selfId = connection.clientId()
      const next = new Map<string, Participant>()
      for (const clientId of clientIds) {
        if (clientId === selfId) continue
        next.set(clientId, participants.get(clientId) ?? placeholder(clientId))
      }
      participants.clear()
      next.forEach((participant, clientId) => {
        participants.set(clientId, participant)
      })
      publish()
      scheduleExpiry()
    }),
    connection.on('cursor', (message) => {
      if (
        disposed ||
        message.from === connection.clientId() ||
        !message.from ||
        !Number.isFinite(message.x) ||
        !Number.isFinite(message.y) ||
        !message.name.trim() ||
        !COLORS.some((color) => color === message.color)
      )
        return
      participants.set(message.from, {
        name: message.name,
        color: message.color,
        cursor: { x: message.x, y: message.y, lastSeen: performance.now() },
      })
      publish()
      scheduleExpiry()
    }),
    connection.on('leave', ({ clientId }) => {
      if (!disposed && participants.delete(clientId)) {
        publish()
        scheduleExpiry()
      }
    }),
    connection.on('welcome', () => {
      if (!disposed) reset()
    }),
    connection.onStatus((status) => {
      if (!disposed && status !== 'open') reset()
    }),
  ]
  return {
    setIdentity(nextIdentity: Identity | null) {
      currentIdentity = nextIdentity
    },
    pointer(pointer: Pointer) {
      if (
        disposed ||
        !Number.isFinite(pointer.x) ||
        !Number.isFinite(pointer.y)
      )
        return
      // Excalidraw already supplies scene coordinates; do not transform again.
      pending = { x: pointer.x, y: pointer.y }
      if (timer !== undefined) return
      const delay = CURSOR_INTERVAL_MS - (performance.now() - lastSentAt)
      if (delay <= 0) flush()
      else timer = setTimeout(flush, delay)
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      clearTimeout(expiryTimer)
      unsubscribe.forEach((off) => {
        off()
      })
    },
  }
}
