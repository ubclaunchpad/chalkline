import { useCallback } from 'react'
import type { DragEvent } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { addComponentAtViewportPoint } from './addComponent'
import { catalog, COMPONENT_DRAG_MIME } from './catalog'

/**
 * Drop handlers for the element wrapping the Excalidraw canvas: dragging a
 * sidebar kind onto the board adds it where it was dropped.
 */
export function useCanvasDropHandlers(api: ExcalidrawImperativeAPI | null): {
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
} {
  const onDragOver = useCallback((event: DragEvent) => {
    if (event.dataTransfer.types.includes(COMPONENT_DRAG_MIME)) {
      event.preventDefault()
    }
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      const kind = event.dataTransfer.getData(COMPONENT_DRAG_MIME)
      const entry = catalog.find((candidate) => candidate.kind === kind)
      if (!api || !entry) {
        return
      }
      event.preventDefault()
      addComponentAtViewportPoint(api, entry, {
        clientX: event.clientX,
        clientY: event.clientY,
      })
    },
    [api],
  )

  return { onDragOver, onDrop }
}
