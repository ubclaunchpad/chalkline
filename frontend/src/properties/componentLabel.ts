import { newElementWith } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { componentLabelText } from './labelText.ts'
import { readComponent } from './updateComponent.ts'

// Returns the component's label with its text matching the component's
// current data, or null when there is nothing to update: no bound label, or
// the label already shows the right text (so no needless version bump).
export function relabelComponent(
  container: OrderedExcalidrawElement,
  elements: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement | null {
  const data: ComponentData | null = readComponent(container)
  if (!data) {
    return null
  }

  const labelId: string | undefined = container.boundElements?.find(
    (bound) => bound.type === 'text',
  )?.id
  const label: OrderedExcalidrawElement | undefined = elements.find(
    (el: OrderedExcalidrawElement) => el.id === labelId,
  )
  if (!label || label.type !== 'text' || label.isDeleted) {
    return null
  }

  const text: string = componentLabelText(data.name, data.kind)
  if (label.originalText === text) {
    return null
  }

  // Excalidraw does not export its text measuring, so the label keeps its old
  // width. It stays centred in the box, but a much longer name is not wrapped.
  return newElementWith(label, { text, originalText: text })
}
