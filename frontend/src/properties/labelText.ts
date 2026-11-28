import type { ComponentKind } from '../catalog/catalog.ts'

// A box's label, shared by the sidebar and the panel. No runtime imports, so
// tests need no Excalidraw mock.
export function componentLabelText(name: string, kind: ComponentKind): string {
  return `${name}\n${kind}`
}
