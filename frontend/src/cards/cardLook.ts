// How a component card looks on the board: its size, where the icon, name
// and detail line sit, their fonts and colours, and how text is shortened to
// fit. Pure, so it loads in tests without Excalidraw.

import type { ComponentData } from '../catalog/catalog.ts'
import { canvasColor } from '../design/canvasColor.ts'
import { describeComponent } from './describe.ts'

// Excalidraw's FONT_FAMILY ids (0.18.1). They are saved with every board, so
// they never change; copied here so this module loads without Excalidraw.
export const FONT_FAMILY = { Cascadia: 3, Nunito: 6 } as const

// Excalidraw's "adaptive radius" rounded corners (ROUNDNESS.ADAPTIVE_RADIUS).
export const ADAPTIVE_RADIUS_ROUNDNESS = 3

// Dark-theme tokens from index.css (a test keeps them in step). They are what
// people should see; canvasColor turns them into the colours to store.
export const CARD_TOKENS = {
  fill: '#1f2839', // --chalkline-color-surface
  border: '#2b3650', // --chalkline-color-border
  name: '#f2f6fd', // --chalkline-color-ink
  detail: '#a9b6cf', // --chalkline-color-ink-muted
} as const

export const CARD_COLORS = {
  fill: canvasColor(CARD_TOKENS.fill),
  border: canvasColor(CARD_TOKENS.border),
  name: canvasColor(CARD_TOKENS.name),
  detail: canvasColor(CARD_TOKENS.detail),
} as const

/**
 * Card layout in scene units, measured from the card's top-left corner,
 * following the Figma card (#79 screenshot 2). The icon is vertically centred
 * on the name line (Excalidraw draws Nunito 1.35 lines tall: 15px → 20px).
 */
export const CARD = {
  width: 240,
  height: 84,
  padding: 16,
  /** Corner radius; Excalidraw's adaptive radius keeps it fixed at any size. */
  radius: 10,
  icon: { x: 16, y: 18, size: 16 },
  name: { x: 42, y: 16, fontSize: 15, fontFamily: FONT_FAMILY.Nunito },
  detail: { x: 16, y: 48, fontSize: 13, fontFamily: FONT_FAMILY.Cascadia },
} as const

/** Width of each text line; the text is shortened to fit inside it. */
export const NAME_WIDTH = CARD.width - CARD.name.x - CARD.padding
export const DETAIL_WIDTH = CARD.width - CARD.detail.x - CARD.padding

// Text is fitted by counting characters, not by measuring it in the browser,
// so every window computes the same string even before fonts load.
// Cascadia is monospace (about 0.59em per character), so the detail budget is
// exact. Nunito is proportional: mixed-case text averages about 0.5em, so 22
// characters fit the 182px line with room to spare, including every default name up to
// "Serverless function 99". Names in wide capitals can be clipped at the
// line's edge instead of ending in "…"; the full name stays in the data.
export const NAME_MAX_CHARACTERS = 22
export const DETAIL_MAX_CHARACTERS = Math.floor(
  DETAIL_WIDTH / (CARD.detail.fontSize * 0.59),
)

const ELLIPSIS = '…'

/**
 * Puts text on one line and, if it has more than `maxCharacters` characters,
 * cuts it and ends it with "…". Counts code points, so emoji are not split.
 */
export function fitText(text: string, maxCharacters: number): string {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim())
  if (characters.length <= maxCharacters) {
    return characters.join('')
  }
  return (
    characters
      .slice(0, maxCharacters - 1)
      .join('')
      .trimEnd() + ELLIPSIS
  )
}

/** The name and detail lines a card shows for its component. */
export function cardTexts(data: ComponentData): {
  name: string
  detail: string
} {
  return {
    name: fitText(data.name, NAME_MAX_CHARACTERS),
    detail: fitText(describeComponent(data), DETAIL_MAX_CHARACTERS),
  }
}
