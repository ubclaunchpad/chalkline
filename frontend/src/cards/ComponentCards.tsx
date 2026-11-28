// Board-wide support for component cards: registers the icon pictures every
// card points at (scene sync sends elements, not files, so every window
// registers them), keeps Excalidraw from adding its own labels inside cards,
// keeps each card's text equal to its data, and handles renaming a card from
// the board.

import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useEffect, type RefObject } from 'react'
import { catalog } from '../sidebar/catalog.ts'
import { CardRename } from './CardRename.tsx'
import { cardIconFiles } from './cardIcons.ts'
import { useCardLabelGuard } from './useCardLabelGuard.ts'
import { useCardTextRepair } from './useCardTextRepair.ts'

interface ComponentCardsProps {
  api: ExcalidrawImperativeAPI | null
  /** The element wrapping Excalidraw. */
  canvasRef: RefObject<HTMLElement | null>
}

export function ComponentCards({ api, canvasRef }: ComponentCardsProps) {
  useEffect(() => {
    api?.addFiles(cardIconFiles(catalog))
  }, [api])
  useCardLabelGuard(api, canvasRef)
  useCardTextRepair(api)

  return <CardRename api={api} canvasRef={canvasRef} />
}
