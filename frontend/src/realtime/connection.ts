import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type ServerMessageType,
} from './messages'

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

export interface BoardConnection {
  send(message: ClientMessage): void
  on<T extends ServerMessageType>(
    type: T,
    handler: (message: Extract<ServerMessage, { type: T }>) => void,
  ): () => void
  status(): ConnectionStatus
  onStatus(handler: (status: ConnectionStatus) => void): () => void
  clientId(): string | null
  close(): void
}

function socketUrl(boardId: string): string {
  const url = new URL('/ws', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('board', boardId)
  return url.toString()
}


// After a drop, wait 1s, then 2s, then 5s before every later attempt.
const RETRY_DELAYS_MS = [1000, 2000, 5000]

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

  function setStatus(next: ConnectionStatus) {
    if (next === status) return
    status = next
    //run all statuses 
    for (const handler of [...statusHandlers]) handler(next)
  }

  function connect() {
    setStatus('connecting')
    const ws = new WebSocket(socketUrl(boardId))
    socket = ws

    ws.onopen = () => {
      // back online, next drop should start at 1 second
      failedAttempts = 0
      setStatus('open')
    }

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return

      const message: ServerMessage | null = parseServerMessage(event.data)
      if (message === null) return
      if (message.type === 'welcome') clientId = message.clientId

      const subscribers = handlers.get(message.type)
      if (!subscribers) return
      for (const handler of [...subscribers]) handler(message)
    }

    ws.onclose = () => {
      if (closedByUser) return
      socket = null
      clientId = null
      setStatus('closed')

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