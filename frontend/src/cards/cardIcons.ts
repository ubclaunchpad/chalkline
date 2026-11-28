// The icon on each card is an Excalidraw image element pointing at a file per
// kind. Scene sync sends elements but not files, so every window registers
// the same files (same ids, same pictures) when the board opens.

import type { FileId } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, DataURL } from '@excalidraw/excalidraw/types'
import type { ComponentKind } from '../catalog/catalog.ts'
import { canvasColor } from '../design/canvasColor.ts'
import type { CatalogEntry } from '../sidebar/catalog.ts'

export const iconFileId = (kind: ComponentKind): FileId =>
  `chalkline-icon-${kind}` as FileId

/** One SVG file per kind: its Figma icon drawn in the kind's accent. */
export function cardIconFiles(
  entries: readonly CatalogEntry[],
): BinaryFileData[] {
  return entries.map((entry) => {
    const svg = entry.icon.replaceAll('currentColor', canvasColor(entry.color))
    return {
      id: iconFileId(entry.kind),
      mimeType: 'image/svg+xml',
      dataURL: `data:image/svg+xml;base64,${btoa(svg)}` as DataURL,
      created: 0,
    }
  })
}
