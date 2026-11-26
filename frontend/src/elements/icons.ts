// Kind icons on component cards. Each card gets a locked image element whose
// id is derived from the card's id, so every client creates the same one, and
// a file per kind that every client registers on load (files are not synced).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BinaryFileData } from '@excalidraw/excalidraw/types'
import type { FileId } from '@excalidraw/excalidraw/element/types'
import { canvasColor } from '../design/canvasColor'
import { ICON_STROKE_WIDTH } from '../design/Icon'
import { catalog, type ComponentKind } from '../sidebar/catalog'
import { CARD } from './look'

const ICON_SUFFIX = ':icon'

export const iconIdFor = (cardId: string) => cardId + ICON_SUFFIX

/** The card id an icon element belongs to, or null for any other element. */
export const cardIdOfIcon = (id: string) =>
  id.endsWith(ICON_SUFFIX) ? id.slice(0, -ICON_SUFFIX.length) : null

export const iconFileId = (kind: ComponentKind) =>
  `chalkline-icon-${kind}` as FileId

/** Top-centre of the card. */
export function iconPosition(card: { x: number; y: number; width: number }) {
  return {
    x: card.x + (card.width - CARD.iconSize) / 2,
    y: card.y + CARD.iconTop,
  }
}

/** One SVG file per kind: the Tabler icon drawn in the kind's colour. */
export function iconFiles(): BinaryFileData[] {
  return catalog.map((entry) => {
    const svg = renderToStaticMarkup(
      createElement(entry.icon, {
        size: CARD.iconSize,
        color: canvasColor(entry.color),
        stroke: ICON_STROKE_WIDTH,
      }),
    )
    return {
      id: iconFileId(entry.kind),
      mimeType: 'image/svg+xml',
      dataURL:
        `data:image/svg+xml;base64,${btoa(svg)}` as BinaryFileData['dataURL'],
      created: 0,
    }
  })
}
