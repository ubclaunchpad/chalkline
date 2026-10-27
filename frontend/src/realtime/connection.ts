import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type ServerMessageType,
} from './messages'

/**
 * Where the connection is right now. `closed` covers both waiting to
 * retry after a drop and being closed for good with `close()`.
 */
export type ConnectionStatus = 'connecting' | 'open' | 'closed'

/** One shared WebSocket connection to a board, returned by `connectToBoard`. */
export interface BoardConnection {
  /**
   * Sends a message to the server as JSON. Messages sent while the
   * connection is not open are dropped, not queued.
   */
  send(message: ClientMessage): void

  /**
   * Calls `handler` with every valid server message of the given type.
   * Handlers stay subscribed across reconnects.
   *
   * @returns A function that unsubscribes the handler.
   */
  on<T extends ServerMessageType>(
    type: T,
    handler: (message: Extract<ServerMessage, { type: T }>) => void,
  ): () => void

  /** Returns the current status. */
  status(): ConnectionStatus

  /**
   * Calls `handler` each time the status changes. It is not called with
   * the current status when it subscribes.
   *
   * @returns A function that unsubscribes the handler.
   */
  onStatus(handler: (status: ConnectionStatus) => void): () => void

  /**
   * Returns the id the server gave this tab in its `welcome` message, or
   * `null` before the welcome arrives and after the connection drops.
   */
  clientId(): string | null

  /** Closes the socket and stops retrying. The connection can't be reopened. */
  close(): void
}

/** Builds the `/ws?board=<id>` URL on the page's host, with `wss:` on https. */
function socketUrl(boardId: string): string {
  const url = new URL('/ws', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('board', boardId)
  return url.toString()
}

/**
 * Calls a subscriber, logging anything it throws so one broken handler
 * can't stop the others or the retry loop.
 */
function callSafely<T>(handler: (value: T) => void, value: T) {
  try {
    handler(value)
  } catch (error) {
    console.error(error)
  }
}

// After a drop, wait 1s, then 2s, then 5s before every later attempt.
const RETRY_DELAYS_MS = [1000, 2000, 5000]

/**
 * Opens a WebSocket connection to a board and keeps it open.
 *
 * Connecting starts straight away. If the socket drops, it retries after
 * 1s, then 2s, then every 5s. The delays start over once the server
 * sends `welcome` again.
 * Retrying only stops when `close()` is called.
 *
 * @param boardId The board to join, sent as `?board=` on the socket URL.
 */
export function connectToBoard(boardId: string): BoardConnection {
  let socket: WebSocket | null = null
  let status: ConnectionStatus = 'connecting'
  let clientId: string | null = null

  let failedAttempts = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let closedByUser = false

  type Handler = (message: ServerMessage) => void
  const handlers = new Map<ServerMessageType, Set<Handler>>()
  const statusHandlers = new Set<(status: ConnectionStatus) => void>()

  // Returns false if a status handler called close(), so callers can stop.
  function setStatus(next: ConnectionStatus): boolean {
    if (next !== status) {
      status = next
      // Copy first, so a handler that unsubscribes doesn't skip the next one.
      for (const handler of [...statusHandlers]) {
        // If a handler changed the status, the later handlers have already been
        // told the newer one, so stop here instead of sending them this old status.
        if (status !== next) break
        callSafely(handler, next)
      }
    }
    return !closedByUser
  }

  function connect() {
    if (!setStatus('connecting')) return
    const ws = new WebSocket(socketUrl(boardId))
    socket = ws

    ws.onopen = () => {
      if (closedByUser) return
      setStatus('open')
    }

    ws.onmessage = (event) => {
      if (closedByUser || typeof event.data !== 'string') return

      const message: ServerMessage | null = parseServerMessage(event.data)
      if (message === null) return
      if (message.type === 'welcome') {
        clientId = message.clientId
        // The server accepted us, so the next drop starts at 1 second again.
        // Resetting on open instead would retry every second against a
        // server that opens the socket and then rejects it.
        failedAttempts = 0
      }

      const subscribers = handlers.get(message.type)
      if (!subscribers) return
      for (const handler of [...subscribers]) callSafely(handler, message)
    }

    ws.onclose = () => {
      if (closedByUser) return
      socket = null
      clientId = null
      if (!setStatus('closed')) return

      // delay for reconnecting
      const delay =
        RETRY_DELAYS_MS[Math.min(failedAttempts, RETRY_DELAYS_MS.length - 1)]
      failedAttempts += 1
      retryTimer = setTimeout(connect, delay)
    }
  }

  connect()

  return {
    send(message) {
      if (status !== 'open' || socket === null) return
      socket.send(JSON.stringify(message))
    },

    on(type, handler) {
      // Safe: onmessage only calls a handler with messages of its own type.
      const typedHandler = handler as Handler
      const subscribers = handlers.get(type) ?? new Set<Handler>()
      // If type already exists in handlers then it does nothing
      handlers.set(type, subscribers)
      subscribers.add(typedHandler)

      // returns unsubscribe function
      return () => {
        subscribers.delete(typedHandler)
      }
    },
    status: () => status,
    onStatus(handler) {
      statusHandlers.add(handler)

      // unsubscribe function
      return () => {
        statusHandlers.delete(handler)
      }
    },
    clientId: () => clientId,
    close() {
      closedByUser = true
      clearTimeout(retryTimer)
      socket?.close()
      socket = null
      setStatus('closed')
    },
  }
}
