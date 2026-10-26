import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { connectToBoard } from './connection'

// Stands in for the browser's WebSocket so these tests need no server.
// Unlike a real socket, close() calls onclose straight away rather than
// later, so don't rely on that ordering in connection.ts.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  url: string
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }

  // Helpers that act like the server.
  serverOpens() {
    this.onopen?.()
  }
  serverSends(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  serverDrops() {
    this.onclose?.()
  }
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1)
  if (!socket) throw new Error('no socket was opened')
  return socket
}

// Checks that a new socket opens after exactly `ms`, not a moment sooner.
function expectRetryAfter(ms: number) {
  const count = FakeWebSocket.instances.length
  vi.advanceTimersByTime(ms - 1)
  expect(FakeWebSocket.instances).toHaveLength(count)
  vi.advanceTimersByTime(1)
  expect(FakeWebSocket.instances).toHaveLength(count + 1)
}

const cursorMessage = {
  type: 'cursor',
  from: 'c_91bd',
  x: 120.5,
  y: 88,
  name: 'Kathy',
  color: '#e03131',
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('window', { location: { href: 'http://localhost:5173/' } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('connectToBoard', () => {
  describe('connecting', () => {
    it('opens a socket for the board', () => {
      connectToBoard('abc')
      expect(latestSocket().url).toBe('ws://localhost:5173/ws?board=abc')
    })

    it('uses wss on https pages', () => {
      vi.stubGlobal('window', { location: { href: 'https://example.com/' } })
      connectToBoard('abc')
      expect(latestSocket().url).toBe('wss://example.com/ws?board=abc')
    })

    it('is connecting until the socket opens', () => {
      const connection = connectToBoard('abc')
      expect(connection.status()).toBe('connecting')
      latestSocket().serverOpens()
      expect(connection.status()).toBe('open')
    })

    it('tells status handlers about each change', () => {
      const connection = connectToBoard('abc')
      const seen: string[] = []
      connection.onStatus((status) => seen.push(status))

      latestSocket().serverOpens()
      latestSocket().serverDrops()
      vi.advanceTimersByTime(1000)

      expect(seen).toEqual(['open', 'closed', 'connecting'])
    })

    it('stops telling a status handler after it unsubscribes', () => {
      const connection = connectToBoard('abc')
      const handler = vi.fn()
      const unsubscribe = connection.onStatus(handler)

      unsubscribe()
      latestSocket().serverOpens()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('sending', () => {
    it('sends messages as JSON once open', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverOpens()

      connection.send({ type: 'change', elements: [] })

      expect(latestSocket().sent).toEqual(['{"type":"change","elements":[]}'])
    })

    it('ignores messages sent before the socket opens', () => {
      const connection = connectToBoard('abc')
      connection.send({ type: 'change', elements: [] })
      expect(latestSocket().sent).toEqual([])
    })

    it('ignores messages sent while waiting to reconnect', () => {
      const connection = connectToBoard('abc')
      const firstSocket = latestSocket()
      firstSocket.serverOpens()
      firstSocket.serverDrops()

      connection.send({ type: 'change', elements: [] })

      expect(firstSocket.sent).toEqual([])
    })
  })

  describe('receiving', () => {
    it('passes messages to handlers of that type only', () => {
      const connection = connectToBoard('abc')
      const onCursor = vi.fn()
      const onLeave = vi.fn()
      connection.on('cursor', onCursor)
      connection.on('leave', onLeave)

      latestSocket().serverSends(cursorMessage)

      expect(onCursor).toHaveBeenCalledWith(cursorMessage)
      expect(onLeave).not.toHaveBeenCalled()
    })

    it('passes each message to every handler of that type', () => {
      const connection = connectToBoard('abc')
      const first = vi.fn()
      const second = vi.fn()
      connection.on('cursor', first)
      connection.on('cursor', second)

      latestSocket().serverSends(cursorMessage)

      expect(first).toHaveBeenCalledOnce()
      expect(second).toHaveBeenCalledOnce()
    })

    it('stops passing messages after a handler unsubscribes', () => {
      const connection = connectToBoard('abc')
      const onCursor = vi.fn()
      const unsubscribe = connection.on('cursor', onCursor)

      unsubscribe()
      latestSocket().serverSends(cursorMessage)

      expect(onCursor).not.toHaveBeenCalled()
    })

    it('ignores invalid messages', () => {
      const connection = connectToBoard('abc')
      const onWelcome = vi.fn()
      connection.on('welcome', onWelcome)

      latestSocket().onmessage?.({ data: 'not json' })
      latestSocket().serverSends({ type: 'welcome' })

      expect(onWelcome).not.toHaveBeenCalled()
      expect(connection.clientId()).toBeNull()
    })

    it('keeps handlers after reconnecting', () => {
      const connection = connectToBoard('abc')
      const onCursor = vi.fn()
      connection.on('cursor', onCursor)

      latestSocket().serverDrops()
      vi.advanceTimersByTime(1000)
      latestSocket().serverSends(cursorMessage)

      expect(onCursor).toHaveBeenCalledWith(cursorMessage)
    })
  })

  describe('clientId', () => {
    it('is null until the welcome message arrives', () => {
      const connection = connectToBoard('abc')
      expect(connection.clientId()).toBeNull()
    })

    it('comes from the welcome message', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverSends({ type: 'welcome', clientId: 'c_7f3a' })
      expect(connection.clientId()).toBe('c_7f3a')
    })

    it('is forgotten when the connection drops', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverSends({ type: 'welcome', clientId: 'c_7f3a' })
      latestSocket().serverDrops()
      expect(connection.clientId()).toBeNull()
    })

    it('comes from the new welcome message after reconnecting', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverSends({ type: 'welcome', clientId: 'c_7f3a' })
      latestSocket().serverDrops()
      vi.advanceTimersByTime(1000)

      latestSocket().serverSends({ type: 'welcome', clientId: 'c_2b8e' })

      expect(connection.clientId()).toBe('c_2b8e')
    })
  })

  describe('retrying', () => {
    it('retries after 1s, then 2s, then every 5s', () => {
      connectToBoard('abc')
      latestSocket().serverOpens()

      latestSocket().serverDrops()
      expectRetryAfter(1000)
      latestSocket().serverDrops()
      expectRetryAfter(2000)
      latestSocket().serverDrops()
      expectRetryAfter(5000)
      latestSocket().serverDrops()
      expectRetryAfter(5000)
    })

    it('is closed while waiting to retry', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverOpens()
      latestSocket().serverDrops()
      expect(connection.status()).toBe('closed')
    })

    it('starts the delays over once the server welcomes it again', () => {
      connectToBoard('abc')
      latestSocket().serverDrops()
      expectRetryAfter(1000)
      latestSocket().serverDrops()
      expectRetryAfter(2000)

      latestSocket().serverOpens()
      latestSocket().serverSends({ type: 'welcome', clientId: 'c_7f3a' })
      latestSocket().serverDrops()
      expectRetryAfter(1000)
    })

    // A server that accepts the socket and then closes it, for example
    // because it rejects the board, must not be retried every second.
    it('keeps growing the delays when the server drops before welcoming', () => {
      connectToBoard('abc')

      latestSocket().serverOpens()
      latestSocket().serverDrops()
      expectRetryAfter(1000)
      latestSocket().serverOpens()
      latestSocket().serverDrops()
      expectRetryAfter(2000)
      latestSocket().serverOpens()
      latestSocket().serverDrops()
      expectRetryAfter(5000)
    })

    it('retries for the same board', () => {
      connectToBoard('abc')
      latestSocket().serverDrops()
      vi.advanceTimersByTime(1000)
      expect(latestSocket().url).toBe('ws://localhost:5173/ws?board=abc')
    })
  })

  describe('close', () => {
    it('closes the socket and reports closed', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverOpens()

      connection.close()

      expect(latestSocket().closed).toBe(true)
      expect(connection.status()).toBe('closed')
    })

    it('does not retry after closing', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverOpens()

      connection.close()
      vi.advanceTimersByTime(60_000)

      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it('cancels a retry that is already waiting', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverDrops()

      connection.close()
      vi.advanceTimersByTime(60_000)

      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it('ignores sends after closing', () => {
      const connection = connectToBoard('abc')
      latestSocket().serverOpens()

      connection.close()
      connection.send({ type: 'change', elements: [] })

      expect(latestSocket().sent).toEqual([])
    })

    it('ignores messages that arrive after closing', () => {
      const connection = connectToBoard('abc')
      const socket = latestSocket()
      const onCursor = vi.fn()
      connection.on('cursor', onCursor)
      socket.serverOpens()

      connection.close()
      socket.serverSends(cursorMessage)
      socket.serverSends({ type: 'welcome', clientId: 'c_7f3a' })

      expect(onCursor).not.toHaveBeenCalled()
      expect(connection.clientId()).toBeNull()
    })

    it('stays closed if the socket opens after closing', () => {
      const connection = connectToBoard('abc')
      const socket = latestSocket()

      connection.close()
      socket.serverOpens()

      expect(connection.status()).toBe('closed')
    })

    it('does not retry when a status handler closes on a drop', () => {
      const connection = connectToBoard('abc')
      connection.onStatus((status) => {
        if (status === 'closed') connection.close()
      })

      latestSocket().serverOpens()
      latestSocket().serverDrops()
      vi.advanceTimersByTime(60_000)

      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it('does not open a socket when a status handler closes while reconnecting', () => {
      const connection = connectToBoard('abc')
      connection.onStatus((status) => {
        if (status === 'connecting') connection.close()
      })

      latestSocket().serverDrops()
      vi.advanceTimersByTime(1000)

      expect(FakeWebSocket.instances).toHaveLength(1)
      expect(connection.status()).toBe('closed')
    })
  })

  describe('handlers that throw', () => {
    // A thrown error should be logged, not stop the connection working.
    let errorSpy: MockInstance<typeof console.error>

    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('keeps retrying when a status handler throws', () => {
      const connection = connectToBoard('abc')
      connection.onStatus(() => {
        throw new Error('broken status handler')
      })

      expect(() => {
        latestSocket().serverDrops()
      }).not.toThrow()
      expectRetryAfter(1000)
    })

    it('still tells other status handlers when one throws', () => {
      const connection = connectToBoard('abc')
      const handler = vi.fn()
      connection.onStatus(() => {
        throw new Error('broken status handler')
      })
      connection.onStatus(handler)

      latestSocket().serverOpens()

      expect(handler).toHaveBeenCalledWith('open')
    })

    it('still passes messages to other handlers when one throws', () => {
      const connection = connectToBoard('abc')
      const handler = vi.fn()
      connection.on('cursor', () => {
        throw new Error('broken cursor handler')
      })
      connection.on('cursor', handler)

      expect(() => {
        latestSocket().serverSends(cursorMessage)
      }).not.toThrow()
      expect(handler).toHaveBeenCalledWith(cursorMessage)
    })

    it('logs the error', () => {
      const connection = connectToBoard('abc')
      const error = new Error('broken status handler')
      connection.onStatus(() => {
        throw error
      })

      latestSocket().serverOpens()

      expect(errorSpy).toHaveBeenCalledWith(error)
    })
  })
})
