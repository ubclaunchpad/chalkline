import { createContext, useContext, useEffect, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

export type PanelId =
  'inspector' | 'checks' | 'review' | 'assistant' | 'comments' | 'practice'

export type Access = 'edit' | 'view'

export interface BoardContextValue {
  api: ExcalidrawImperativeAPI | null
  boardId: string
  access: Access
  setAccess: (access: Access) => void
  panel: PanelId | null
  openPanel: (panel: PanelId) => void
  closePanel: () => void
  togglePanel: (panel: PanelId) => void
}

export const BoardContext = createContext<BoardContextValue | null>(null)

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside BoardProvider')
  return value
}

export interface SceneSnapshot {
  elements: readonly ExcalidrawElement[]
  selectedIds: string[]
}

const EMPTY: SceneSnapshot = { elements: [], selectedIds: [] }

/** The live (non-deleted) scene and selection, refreshed on every change. */
export function useScene(): SceneSnapshot {
  const { api } = useBoard()
  const [snapshot, setSnapshot] = useState<SceneSnapshot>(EMPTY)
  useEffect(() => {
    if (!api) return
    let frame = 0
    const read = () => {
      frame = 0
      const state = api.getAppState()
      setSnapshot({
        elements: api.getSceneElements(),
        selectedIds: Object.keys(state.selectedElementIds),
      })
    }
    read()
    // Excalidraw fires onChange often (pointer moves); batch to one read per frame.
    const off = api.onChange(() => {
      if (!frame) frame = requestAnimationFrame(read)
    })
    return () => {
      off()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [api])
  return snapshot
}
