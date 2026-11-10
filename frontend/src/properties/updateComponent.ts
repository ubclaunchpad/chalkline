import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types'
import { newElementWith } from '@excalidraw/excalidraw'
import type { ComponentData } from '../catalog/catalog.ts'
import {
  validateComponent,
  type ValidationResult,
} from '../catalog/validate.ts'

// What the panel is allowed to change.
export interface ComponentChange {
  name?: string
  props?: Record<string, unknown>
}

export type UpdateResult =
  | { ok: true; element: OrderedExcalidrawElement }
  | { ok: false; problems: string[] }

// The element's component data, or null for a plain shape. customData can come
// from another client or a saved board, so it is validated, not trusted.
export function readComponent(
  element: ExcalidrawElement,
): ComponentData | null {
  const result: ValidationResult = validateComponent(element.customData)
  return result.ok ? result.data : null
}

// Applies a change from the panel. The element is returned as a new object with
// a bumped version, which is what makes scene sync send it to other clients.
// Invalid changes return problems and leave the element untouched.
export function updateComponent(
  element: OrderedExcalidrawElement,
  change: ComponentChange,
): UpdateResult {
  const current = readComponent(element)
  if (!current) {
    return { ok: false, problems: ['element is not a component'] }
  }

  const result: ValidationResult = validateComponent({
    v: current.v,
    kind: current.kind,
    name: change.name ?? current.name,
    // Merge so that changing one setting keeps the others.
    props: { ...current.props, ...change.props },
  })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    element: newElementWith(element, { customData: result.data }),
  }
}
