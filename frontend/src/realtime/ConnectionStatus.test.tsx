// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardConnectionProvider } from './BoardConnectionProvider'
import { ConnectionStatus } from './ConnectionStatus'
import { FakeWebSocket } from './fakeWebSocket'

function renderStatus() {
  render(<ConnectionStatus />, { wrapper: BoardConnectionProvider })
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1)
  if (!socket) throw new Error('no socket was opened')
  return socket
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeWebSocket)
  window.history.replaceState(null, '', '/?board=team')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ConnectionStatus', () => {
  it('shows connecting before the first connection opens', () => {
    renderStatus()

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Connecting…')
    expect(status.querySelector('[aria-hidden="true"]')?.className).toContain(
      'bg-warning',
    )
    expect(status.textContent).not.toContain('Saved')
  })

  it('shows connected once the connection opens', () => {
    renderStatus()

    act(() => {
      latestSocket().serverOpens()
    })

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Connected')
    expect(status.querySelector('[aria-hidden="true"]')?.className).toContain(
      'bg-success',
    )
  })

  it('shows reconnecting after a drop until a retry opens', () => {
    renderStatus()
    act(() => {
      latestSocket().serverOpens()
    })

    act(() => {
      latestSocket().serverDrops()
    })
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…')
    expect(
      screen.getByRole('status').querySelector('[aria-hidden="true"]')
        ?.className,
    ).toContain('bg-danger')

    // The retry is connecting again, but the label stays "Reconnecting…".
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…')

    act(() => {
      latestSocket().serverOpens()
    })
    expect(screen.getByRole('status').textContent).toBe('Connected')
  })
})
