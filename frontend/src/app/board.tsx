import { useMemo, useState, type ReactNode } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  BoardContext,
  type Access,
  type BoardContextValue,
  type PanelId,
} from './context'

export function BoardProvider({
  api,
  boardId,
  children,
}: {
  api: ExcalidrawImperativeAPI | null
  boardId: string
  children: ReactNode
}) {
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [access, setAccess] = useState<Access>('edit')
  const value = useMemo<BoardContextValue>(
    () => ({
      api,
      boardId,
      access,
      setAccess,
      panel,
      openPanel: setPanel,
      closePanel: () => {
        setPanel(null)
      },
      togglePanel: (next) => {
        setPanel((current) => (current === next ? null : next))
      },
    }),
    [api, boardId, access, panel],
  )
  return <BoardContext value={value}>{children}</BoardContext>
}
