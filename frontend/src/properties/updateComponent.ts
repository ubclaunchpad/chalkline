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

// Settings are flat (text, number, choice), so a shallow comparison is enough.
function isSameComponent(a: ComponentData, b: ComponentData): boolean {
  const aProps: Record<string, unknown> = a.props
  const bProps: Record<string, unknown> = b.props
  const keys = Object.keys(aProps)
  return (
    a.name === b.name &&
    keys.length === Object.keys(bProps).length &&
    keys.every((key) => Object.is(aProps[key], bProps[key]))
  )
}

// Applies a change from the panel. A real change returns a new object with a bumped version.
// A change that leaves the data as it was returns the same element.
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

  if (isSameComponent(current, result.data)) {
    return { ok: true, element }
  }

  return {
    ok: true,
    element: newElementWith(element, { customData: result.data }),
  }
}
