import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '../realtime/messages'
import { createIdentity } from './identity'
import {
  CURSOR_INTERVAL_MS,
  INACTIVITY_MS,
  startPresence,
  toCollaborators,
} from './presence'
import type { Participant, PresenceConnection } from './presence'

// Test-only shared connection: never opens a socket or appears in production.
function mockConnection() {
  const handlers = new Set<(message: ServerMessage) => void>()
  const statuses = new Set<
    (status: ReturnType<PresenceConnection['status']>) => void
  >()
  let status: ReturnType<PresenceConnection['status']> = 'open'
  let clientId = 'self'
  const connection: PresenceConnection = {
    send: vi.fn(),
    on(type, handler) {
      const wrapped = (message: ServerMessage) => {
        if (message.type === type)
          handler(message as Extract<ServerMessage, { type: typeof type }>)
      }
      handlers.add(wrapped)
      return () => {
        handlers.delete(wrapped)
      }
    },
    status: () => status,
    onStatus(handler) {
      statuses.add(handler)
      return () => {
        statuses.delete(handler)
      }
    },
    clientId: () => clientId,
  }
  return {
    connection,
    emit: (message: ServerMessage) => {
      handlers.forEach((handler) => {
        handler(message)
      })
    },
    setStatus: (next: typeof status) => {
      status = next
      statuses.forEach((handler) => {
        handler(next)
      })
    },
    setClientId: (next: string) => {
      clientId = next
    },
    listenerCount: () => handlers.size + statuses.size,
  }
}

const cursor = (
  from = 'alice',
  x = 120.5,
): Extract<ServerMessage, { type: 'cursor' }> => ({
  type: 'cursor',
  from,
  x,
  y: -88.25,
  ...createIdentity('Alice'),
})
const point = (x: number, y = -88.25) => ({ x, y, tool: 'pointer' as const })

function setup() {
  const mock = mockConnection()
  let participants: ReadonlyMap<string, Participant> = new Map()
  const update = vi.fn((next: ReadonlyMap<string, Participant>) => {
    participants = next
  })
  const session = startPresence(
    mock.connection,
    createIdentity('Kathy'),
    update,
  )
  return { ...mock, session, update, participants: () => participants }
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'performance',
    ],
  })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('cursor sending', () => {
  it('waits for an identity before sending a cursor', () => {
    const mock = mockConnection()
    const session = startPresence(mock.connection, null, () => undefined)

    session.pointer(point(1))
    expect(mock.connection.send).not.toHaveBeenCalled()

    session.setIdentity(createIdentity('Kathy'))
    session.pointer(point(2))
    expect(mock.connection.send).toHaveBeenCalledWith({
      type: 'cursor',
      x: 2,
      y: -88.25,
      ...createIdentity('Kathy'),
    })
    session.dispose()
  })

  it('sends board coordinates unchanged and only when moved', () => {
    const { session, connection } = setup()
    session.pointer(point(120.5))
    expect(connection.send).toHaveBeenCalledWith({
      type: 'cursor',
      x: 120.5,
      y: -88.25,
      ...createIdentity('Kathy'),
    })
    vi.advanceTimersByTime(100)
    session.pointer(point(120.5))
    vi.advanceTimersByTime(100)
    expect(connection.send).toHaveBeenCalledOnce()
    session.pointer(point(0, 0))
    expect(connection.send).toHaveBeenLastCalledWith({
      type: 'cursor',
      x: 0,
      y: 0,
      ...createIdentity('Kathy'),
    })
  })

  it('sends at most 15 per second during continuous movement, including trailing updates', () => {
    const { session, connection } = setup()
    for (let x = 0; x < 1000; x++) {
      session.pointer(point(x))
      vi.advanceTimersByTime(1)
    }
    expect(connection.send).toHaveBeenCalledTimes(15)
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(connection.send).toHaveBeenCalledTimes(16)
    expect(connection.send).toHaveBeenLastCalledWith({
      type: 'cursor',
      x: 999,
      y: -88.25,
      ...createIdentity('Kathy'),
    })
    vi.advanceTimersByTime(1000)
    expect(connection.send).toHaveBeenCalledTimes(16)
  })

  it('coalesces a burst to its latest position without losing the last movement', () => {
    const { session, connection } = setup()
    session.pointer(point(1))
    vi.advanceTimersByTime(10)
    session.pointer(point(2))
    session.pointer(point(3))
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS - 11)
    expect(connection.send).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(connection.send).toHaveBeenLastCalledWith({
      type: 'cursor',
      x: 3,
      y: -88.25,
      ...createIdentity('Kathy'),
    })
  })

  it('does not send when a burst returns to the last sent position', () => {
    const { session, connection } = setup()
    session.pointer(point(1))
    session.pointer(point(2))
    session.pointer(point(1))
    vi.advanceTimersByTime(CURSOR_INTERVAL_MS)
    expect(connection.send).toHaveBeenCalledOnce()
  })

  it('drops pending movement on disconnect and can send the same position after reconnect', () => {
    const { session, connection, setStatus, emit } = setup()
    session.pointer(point(1))
    session.pointer(point(2))
    setStatus('closed')
    vi.advanceTimersByTime(100)
    session.pointer(point(3))
    expect(connection.send).toHaveBeenCalledOnce()
    setStatus('open')
    emit({ type: 'welcome', clientId: 'self' })
    session.pointer(point(1))
    expect(connection.send).toHaveBeenCalledTimes(2)
  })

  it('ignores nonfinite coordinates', () => {
    const { session, connection } = setup()
    session.pointer(point(NaN))
    session.pointer(point(1, Infinity))
    expect(connection.send).not.toHaveBeenCalled()
  })
})

describe('remote presence', () => {
  it('tracks by clientId, supports duplicate names, and replaces updates immutably', () => {
    const test = setup()
    test.emit(cursor())
    const previous = test.participants()
    test.emit(cursor('bob', 40))
    test.emit(cursor('alice', 80))
    expect(test.participants().size).toBe(2)
    expect(test.participants().get('alice')?.cursor?.x).toBe(80)
    expect(previous.get('alice')?.cursor?.x).toBe(120.5)
    expect(test.participants().get('bob')?.name).toBe('Alice')
  })

  it('uses built-in collaborators with names, palette colors and scene coordinates', () => {
    const test = setup()
    test.emit(cursor())
    expect([...toCollaborators(test.participants())]).toEqual([
      [
        'alice',
        {
          username: 'Alice',
          color: {
            background: createIdentity('Alice').color,
            stroke: createIdentity('Alice').color,
          },
          pointer: { x: 120.5, y: -88.25, tool: 'pointer' },
        },
      ],
    ])
  })

  it('removes a client immediately on leave without removing others', () => {
    const test = setup()
    test.emit(cursor())
    test.emit(cursor('bob'))
    test.emit({ type: 'leave', clientId: 'alice' })
    expect([...test.participants().keys()]).toEqual(['bob'])
    const calls = test.update.mock.calls.length
    test.emit({ type: 'leave', clientId: 'unknown' })
    expect(test.update).toHaveBeenCalledTimes(calls)
  })

  it('expires a cursor after ten seconds without removing the roster member', () => {
    const test = setup()
    test.emit({ type: 'participants', clientIds: ['self', 'alice'] })
    test.emit(cursor())
    test.emit(cursor('bob'))
    vi.advanceTimersByTime(9000)
    test.emit(cursor('bob'))
    vi.advanceTimersByTime(999)
    expect(test.participants().size).toBe(2)
    vi.advanceTimersByTime(1)
    expect([...test.participants().keys()]).toEqual(['alice', 'bob'])
    expect(test.participants().get('alice')?.cursor).toBeNull()
    expect(test.participants().get('bob')?.cursor).not.toBeNull()
    expect(toCollaborators(test.participants()).size).toBe(1)
  })

  it('expires at ten seconds even when a cursor arrives between whole seconds', () => {
    const test = setup()
    vi.advanceTimersByTime(137)
    test.emit(cursor())
    vi.advanceTimersByTime(INACTIVITY_MS - 1)
    expect(test.participants().get('alice')?.cursor).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(test.participants().get('alice')?.cursor).toBeNull()
  })

  it('ignores self echoes and malformed cursor data', () => {
    const test = setup()
    test.emit(cursor('self'))
    test.emit(cursor('alice', Infinity))
    test.emit({ ...cursor(), y: NaN })
    test.emit({ ...cursor(), name: ' ' })
    test.emit({ ...cursor(), color: 'invalid' })
    test.emit(cursor(''))
    expect(test.participants().size).toBe(0)
  })

  it('clears stale collaborators on disconnect and new welcome', () => {
    const test = setup()
    test.emit(cursor())
    test.emit({ type: 'participants', clientIds: ['self', 'alice'] })
    test.setStatus('connecting')
    expect(test.participants().size).toBe(0)
    test.setStatus('open')
    test.setClientId('new-self')
    test.emit({ type: 'welcome', clientId: 'new-self' })
    expect(test.participants().size).toBe(0)
    test.emit({ type: 'participants', clientIds: ['new-self', 'new-alice'] })
    expect([...test.participants().keys()]).toEqual(['new-alice'])
  })

  it('uses the roster for membership and fallback metadata until a cursor arrives', () => {
    const test = setup()
    test.emit({ type: 'participants', clientIds: ['self', 'no-cursor'] })
    const placeholder = test.participants().get('no-cursor')
    expect(placeholder?.name).toBe('Guest rsor')
    expect(placeholder?.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(placeholder?.cursor).toBeNull()
    expect(toCollaborators(test.participants()).size).toBe(0)

    test.emit({ type: 'participants', clientIds: ['self', 'no-cursor', 'new'] })
    expect(test.participants().get('no-cursor')).toEqual(placeholder)
    expect(test.participants().has('new')).toBe(true)
    test.emit(cursor('no-cursor'))
    expect(test.participants().get('no-cursor')).toMatchObject({
      name: 'Alice',
      cursor: { x: 120.5, y: -88.25 },
    })
  })

  it('removes membership on updated roster and leave messages', () => {
    const test = setup()
    test.emit({ type: 'participants', clientIds: ['self', 'alice', 'bob'] })
    test.emit(cursor())
    test.emit({ type: 'participants', clientIds: ['self', 'bob'] })
    expect([...test.participants().keys()]).toEqual(['bob'])
    test.emit({ type: 'leave', clientId: 'bob' })
    expect(test.participants().size).toBe(0)
  })

  it('unsubscribes and cancels timers on cleanup, including StrictMode restart', () => {
    const test = setup()
    test.session.pointer(point(1))
    test.session.pointer(point(2))
    expect(test.listenerCount()).toBe(5)
    test.session.dispose()
    const calls = test.update.mock.calls.length
    test.emit(cursor())
    test.session.pointer(point(3))
    vi.advanceTimersByTime(20000)
    expect(test.listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(test.update).toHaveBeenCalledTimes(calls)
    expect(test.connection.send).toHaveBeenCalledOnce()
    const next = startPresence(
      test.connection,
      createIdentity('New name'),
      test.update,
    )
    next.pointer(point(4))
    expect(test.connection.send).toHaveBeenLastCalledWith({
      type: 'cursor',
      x: 4,
      y: -88.25,
      ...createIdentity('New name'),
    })
    next.dispose()
    expect(test.listenerCount()).toBe(0)
  })
})
