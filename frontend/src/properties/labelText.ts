import type { ComponentKind } from '../catalog/catalog.ts'

// The text drawn on a component's box: its name, then its kind. Used both when
// the sidebar creates a box and when the panel renames one, so the two always
// match. This file has no runtime imports, so it is safe to use in tests that
// do not mock Excalidraw.
export function componentLabelText(name: string, kind: ComponentKind): string {
  return `${name}\n${kind}`
}
