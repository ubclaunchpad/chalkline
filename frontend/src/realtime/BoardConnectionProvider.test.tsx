// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardConnectionProvider } from './BoardConnectionProvider'
import type { BoardConnection } from './connection'
import { FakeWebSocket } from './fakeWebSocket'
import { useBoardConnection, useConnectionStatus } from './useBoardConnection'

// `reactStrictMode: true` renders the way the app does in development.

function openSockets() {
  return FakeWebSocket.instances.filter((socket) => !socket.closed)
}

function boardOf(socket: FakeWebSocket) {
  return new URL(socket.url).searchParams.get('board')
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  window.history.replaceState(null, '', '/?board=team')
})

afterEach(() => {
  // Testing Library only cleans up on its own when Vitest globals are on.
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('BoardConnectionProvider', () => {
  it('connects to the board in the address', () => {
    render(<BoardConnectionProvider />)

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(boardOf(FakeWebSocket.instances[0])).toBe('team')
  })

  it('adds the default board to the address and connects to it', () => {
    window.history.replaceState(null, '', '/')

    render(<BoardConnectionProvider />)

    expect(window.location.search).toBe('?board=demo')
    expect(boardOf(FakeWebSocket.instances[0])).toBe('demo')
  })

  it('leaves exactly one connection open under Strict Mode', () => {
    render(<BoardConnectionProvider />, { reactStrictMode: true })
    vi.advanceTimersByTime(10_000)

    // Strict Mode ran setup, cleanup, setup: the first socket was closed.
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(openSockets()).toEqual([FakeWebSocket.instances[1]])
  })

  it('closes the connection for good when unmounted', () => {
    const { unmount } = render(<BoardConnectionProvider />)

    unmount()
    vi.advanceTimersByTime(10_000)

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(openSockets()).toHaveLength(0)
  })

  it('shares the open connection with components inside it', () => {
    const seen: (BoardConnection | null)[] = []

    const { result } = renderHook(
      () => {
        const connection = useBoardConnection()
        seen.push(connection)
        return connection
      },
      { wrapper: BoardConnectionProvider, reactStrictMode: true },
    )

    // Before the effect runs there is no connection yet.
    expect(seen[0]).toBeNull()

    // The latest value is the connection on the socket that stayed open.
    act(() => {
      FakeWebSocket.instances[1].serverOpens()
    })
    expect(result.current?.status()).toBe('open')
  })

  it('throws when useBoardConnection is used outside the provider', () => {
    expect(() => renderHook(() => useBoardConnection())).toThrow(
      'useBoardConnection must be used inside BoardConnectionProvider',
    )
  })
})

describe('useConnectionStatus', () => {
  function renderStatus() {
    return renderHook(() => useConnectionStatus(), {
      wrapper: BoardConnectionProvider,
    })
  }

  it('is connecting before the socket opens', () => {
    const { result } = renderStatus()

    expect(result.current).toBe('connecting')
  })

  it('follows the connection through a drop and a reconnect', () => {
    const { result } = renderStatus()

    act(() => {
      FakeWebSocket.instances[0].serverOpens()
    })
    expect(result.current).toBe('open')

    act(() => {
      FakeWebSocket.instances[0].serverDrops()
    })
    expect(result.current).toBe('closed')

    // The first retry comes after 1 second.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe('connecting')

    act(() => {
      FakeWebSocket.instances[1].serverOpens()
    })
    expect(result.current).toBe('open')
  })
})
