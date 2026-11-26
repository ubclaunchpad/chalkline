import { useEffect } from 'react'
import { useScene } from '../app/context'

// Excalidraw's stroke/fill/sloppiness panel is for plain drawings. When the
// selection is only Chalkline items, the inspector replaces it, so hide it.
export function ShapeActionsGuard() {
  const { elements, selectedIds } = useScene()
  const hide =
    selectedIds.length > 0 &&
    selectedIds.every((id) => {
      const element = elements.find((e) => e.id === id)
      if (!element) return true
      if (element.customData !== undefined) return true
      // A card's label belongs to its container.
      const container =
        element.type === 'text' && element.containerId
          ? elements.find((e) => e.id === element.containerId)
          : undefined
      return container?.customData !== undefined
    })
  useEffect(() => {
    document.body.toggleAttribute('data-hide-shape-actions', hide)
    return () => {
      document.body.removeAttribute('data-hide-shape-actions')
    }
  }, [hide])
  return null
}
