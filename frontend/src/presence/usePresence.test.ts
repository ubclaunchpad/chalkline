// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { createIdentity } from './identity'
import type { PresenceConnection } from './presence'
import { usePresence } from './usePresence'

describe('usePresence', () => {
  it('uses a saved identity when the board connection becomes ready later', () => {
    const send = vi.fn()
    const connection = {
      send,
      on: () => () => undefined,
      status: () => 'open' as const,
      onStatus: () => () => undefined,
      clientId: () => 'self',
    } as PresenceConnection
    const api = {
      updateScene: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI
    const identity = createIdentity('Saved visitor')
    interface Props {
      activeConnection: PresenceConnection | undefined
      activeApi: ExcalidrawImperativeAPI | null
    }
    const initialProps: Props = { activeConnection: undefined, activeApi: null }

    const { result, rerender } = renderHook(
      ({ activeConnection, activeApi }: Props) =>
        usePresence(identity, activeConnection, activeApi),
      { initialProps },
    )

    rerender({ activeConnection: connection, activeApi: api })
    act(() => {
      result.current.onPointerUpdate({
        pointer: { x: 12, y: 34, tool: 'pointer' },
        button: 'up',
        pointersMap: new Map(),
      })
    })

    expect(send).toHaveBeenCalledWith({
      type: 'cursor',
      x: 12,
      y: 34,
      ...identity,
    })
  })
})
