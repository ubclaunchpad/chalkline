import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { readComponent } from './updateComponent.ts'

export interface SelectedComponent {
  element: OrderedExcalidrawElement
  data: ComponentData
}

// The component the panel should show: exactly one selected element that is
// still on the board and holds valid component data. Anything else is null,
// which hides the panel.
export function selectedComponent(
  elements: readonly OrderedExcalidrawElement[],
  selectedElementIds: Readonly<Record<string, true>>,
): SelectedComponent | null {
  const ids: string[] = Object.keys(selectedElementIds)
  if (ids.length !== 1) {
    return null
  }

  // Deleted elements stay in the array (marked isDeleted) so the deletion can
  // sync, so a selected id can point at a box that is no longer there.
  const element: OrderedExcalidrawElement | undefined = elements.find(
    (el: OrderedExcalidrawElement) => el.id === ids[0],
  )
  if (!element || element.isDeleted) {
    return null
  }

  const data: ComponentData | null = readComponent(element)
  if (!data) {
    return null
  }

  return { element, data }
}
