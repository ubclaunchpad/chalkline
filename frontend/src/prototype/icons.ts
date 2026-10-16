// Line icons for each component kind, drawn on a 24x24 grid. They are used in
// the palette and placed on the canvas as Excalidraw image elements.
import type {
  BinaryFileData,
  BinaryFiles,
  DataURL,
} from '@excalidraw/excalidraw/types'
import type { FileId } from '@excalidraw/excalidraw/element/types'
import { CATALOG, KIND_DEFS, type Kind } from './catalog'

const PATHS: Record<Kind, string> = {
  // Monitor on a stand.
  client:
    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  // Globe: content served from everywhere.
  cdn: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  // One input fanning out to three targets.
  load_balancer:
    '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 12h10M7 11l10-5M7 13l10 5"/>',
  // Shield with a request passing through.
  api_gateway:
    '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12h7M13 9.5l2.5 2.5-2.5 2.5"/>',
  // Two-unit server rack.
  service:
    '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01M12 7.5h4M12 16.5h4"/>',
  // Classic cylinder.
  database:
    '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  // Lightning bolt: fast reads.
  cache: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  // Messages lined up, leaving on the right.
  queue:
    '<rect x="2" y="8" width="4" height="8" rx="1"/><rect x="8" y="8" width="4" height="8" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/><path d="M19.5 12H22M20.5 10.5L22 12l-1.5 1.5"/>',
  // Bucket.
  object_storage:
    '<ellipse cx="12" cy="6" rx="8" ry="2.5"/><path d="M4 6l1.8 12.5c.2 1.4 2.9 2.5 6.2 2.5s6-1.1 6.2-2.5L20 6"/>',
}

export function iconSvg(kind: Kind, color = KIND_DEFS[kind].stroke): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[kind]}</svg>`
}

export function iconDataUrl(kind: Kind): string {
  return `data:image/svg+xml;base64,${btoa(iconSvg(kind))}`
}

export function iconFileId(kind: Kind): FileId {
  return `chalkline-icon-${kind}` as FileId
}

/** Files Excalidraw needs to render every icon on the canvas. */
export function iconFiles(): BinaryFiles {
  const files: BinaryFiles = {}
  for (const { kind } of CATALOG) {
    const file: BinaryFileData = {
      id: iconFileId(kind),
      mimeType: 'image/svg+xml',
      dataURL: iconDataUrl(kind) as DataURL,
      created: 0,
    }
    files[file.id] = file
  }
  return files
}
