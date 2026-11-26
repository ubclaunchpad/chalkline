import type {
  Collaborator,
  ExcalidrawProps,
  SocketId,
} from '@excalidraw/excalidraw/types'
import type { ClientMessage, ServerMessage } from '../realtime/messages'
import type { Identity } from './identity'
import { COLORS } from './identity'

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
  x: number
  y: number
  lastSeen: number
  selectedElementIds?: readonly string[]
}

export const CURSOR_INTERVAL_MS = 67 // ceil(1000 / 15), never above 15/s
export const INACTIVITY_MS = 10000
type Pointer = Parameters<
  NonNullable<ExcalidrawProps['onPointerUpdate']>
>[0]['pointer']

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function toCollaborators(
  participants: ReadonlyMap<string, Participant>,
) {
  return new Map<SocketId, Collaborator>(
    [...participants].map(([clientId, participant]) => [
      clientId as SocketId,
      {
        username: participant.name,
        color: { background: participant.color, stroke: participant.color },
        pointer: { x: participant.x, y: participant.y, tool: 'pointer' },
        // Excalidraw outlines these elements in the participant's colour.
        ...(participant.selectedElementIds?.length && {
          selectedElementIds: Object.fromEntries(
            participant.selectedElementIds.map((id) => [id, true as const]),
          ),
        }),
      },
    ]),
  )
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
  let lastPoint: { x: number; y: number } | undefined
  let selection: readonly string[] = []
  let lastSentSelection: readonly string[] = []
  let lastSentAt = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const publish = () => {
    onChange(new Map(participants))
  }
  publish()
  const scheduleExpiry = () => {
    clearTimeout(expiryTimer)
    if (disposed || !participants.size) return
    let nextExpiry = Infinity
    for (const participant of participants.values()) {
      nextExpiry = Math.min(nextExpiry, participant.lastSeen + INACTIVITY_MS)
    }
    expiryTimer = setTimeout(
      () => {
        if (disposed) return
        const now = performance.now()
        for (const [clientId, participant] of participants) {
          if (now - participant.lastSeen >= INACTIVITY_MS)
            participants.delete(clientId)
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
    lastSentSelection = []
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
    if (
      lastSent?.x === point.x &&
      lastSent.y === point.y &&
      sameIds(lastSentSelection, selection)
    )
      return
    // Leave the field out when nothing is selected; older clients ignore it.
    connection.send({
      type: 'cursor',
      ...point,
      ...currentIdentity,
      ...(selection.length > 0 && { selectedElementIds: selection }),
    })
    lastSent = point
    lastSentSelection = selection
    lastSentAt = performance.now()
  }
  const schedule = () => {
    if (timer !== undefined) return
    const delay = CURSOR_INTERVAL_MS - (performance.now() - lastSentAt)
    if (delay <= 0) flush()
    else timer = setTimeout(flush, delay)
  }
  const unsubscribe = [
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
        x: message.x,
        y: message.y,
        lastSeen: performance.now(),
        selectedElementIds: message.selectedElementIds,
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
      lastPoint = pending
      schedule()
    },
    /** Shares this person's selection, riding on the next cursor message. */
    select(ids: readonly string[]) {
      if (disposed || sameIds(ids, selection)) return
      selection = ids
      // A cursor message needs a position; reuse the last one we know.
      pending ??= lastPoint
      if (pending) schedule()
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
