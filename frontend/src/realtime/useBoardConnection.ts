import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react'
import type { BoardConnection, ConnectionStatus } from './connection'

export const DEFAULT_BOARD_ID = 'demo'

export function getBoardId(search: string): string {
  const board = new URLSearchParams(search).get('board')
  return board === null || board === '' ? DEFAULT_BOARD_ID : board
}

// Makes the address bar show the board in use, without reloading the page.
// eg. empty ?board= --> url changes to ?board=demo
export function syncBoardIdToUrl(): string {
  const url = new URL(window.location.href)
  const boardId = getBoardId(url.search)
  if (url.searchParams.get('board') !== boardId) {
    url.searchParams.set('board', boardId)
    window.history.replaceState(window.history.state, '', url)
  }
  return boardId
}

// `undefined` means there is no provider above; `null` means the provider
// hasn't connected yet.
export const BoardConnectionContext = createContext<
  BoardConnection | null | undefined
>(undefined)

/**
 * Returns the board connection shared by `BoardConnectionProvider`.
 *
 * It is `null` on the first render, before the provider's effect has
 * connected. Throws when used outside a `BoardConnectionProvider`.
 */
export function useBoardConnection(): BoardConnection | null {
  const connection = useContext(BoardConnectionContext)
  if (connection === undefined) {
    throw new Error(
      'useBoardConnection must be used inside BoardConnectionProvider',
    )
  }
  return connection
}

/**
 * Returns the shared connection's status and re-renders when it changes.
 *
 * It is `connecting` before the provider has connected. Throws when used
 * outside a `BoardConnectionProvider`.
 */
export function useConnectionStatus(): ConnectionStatus {
  const connection = useBoardConnection()
  // Kept the same between renders, so React doesn't resubscribe each time.
  const subscribe = useCallback(
    (onChange: () => void) =>
      connection ? connection.onStatus(onChange) : () => undefined,
    [connection],
  )
  return useSyncExternalStore(
    subscribe,
    () => connection?.status() ?? 'connecting',
  )
}
