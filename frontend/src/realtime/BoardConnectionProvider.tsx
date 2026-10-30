import { useEffect, useState, type ReactNode } from 'react'
import { connectToBoard, type BoardConnection } from './connection'
import { BoardConnectionContext, syncBoardIdToUrl } from './useBoardConnection'

/**
 * Connects to the board in the address bar once, and shares that one
 * connection with everything inside it through `useBoardConnection()`.
 *
 * In development, React Strict Mode runs the effect as setup, cleanup,
 * setup. Each cleanup closes the connection its own setup opened, so
 * exactly one connection stays open.
 */
export function BoardConnectionProvider({ children}: { children?: ReactNode}) {
  const [connection, setConnection] = useState<BoardConnection | null>(null)

  useEffect(() => {
    const next = connectToBoard(syncBoardIdToUrl())
    // The connection must be created here so cleanup can close it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnection(next)
    return () => {
      next.close()
    }
  }, [])

  return (
    <BoardConnectionContext value={connection}>
      {children}
    </BoardConnectionContext>
  )
}
