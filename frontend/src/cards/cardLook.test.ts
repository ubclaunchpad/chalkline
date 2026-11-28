import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOG, type ComponentData } from '../catalog/catalog.ts'
import {
  CARD,
  CARD_TOKENS,
  DETAIL_MAX_CHARACTERS,
  DETAIL_WIDTH,
  NAME_WIDTH,
  cardTexts,
  fitText,
} from './cardLook.ts'

// The dark theme is the first block of tokens in index.css; the light theme
// follows under [data-theme='light'].
function darkToken(name: string): string | undefined {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
  const darkBlock = css.split("[data-theme='light']")[0]
  return new RegExp(`--chalkline-color-${name}:\\s*(#[0-9a-fA-F]{6})`)
    .exec(darkBlock)?.[1]
    ?.toLowerCase()
}

describe('card tokens', () => {
  it.each([
    ['fill', 'surface'],
    ['border', 'border'],
    ['name', 'ink'],
    ['detail', 'ink-muted'],
  ] as const)('keeps %s equal to the %s token in index.css', (key, token) => {
    expect(CARD_TOKENS[key]).toBe(darkToken(token))
  })
})

describe('card layout', () => {
  it('keeps the icon, name and detail inside the card', () => {
    expect(CARD.icon.x + CARD.icon.size).toBeLessThan(CARD.name.x)
    expect(CARD.name.x + NAME_WIDTH).toBe(CARD.width - CARD.padding)
    expect(CARD.detail.x + DETAIL_WIDTH).toBe(CARD.width - CARD.padding)
    expect(CARD.detail.y + CARD.detail.fontSize * 1.25).toBeLessThan(
      CARD.height - CARD.padding / 2,
    )
  })

  it('fits the detail line to the monospace character width', () => {
    expect(DETAIL_MAX_CHARACTERS).toBe(27)
  })
})

describe('fitText', () => {
  it('leaves text that fits unchanged', () => {
    expect(fitText('orders', 18)).toBe('orders')
    expect(fitText('a'.repeat(18), 18)).toBe('a'.repeat(18))
  })

  it('cuts longer text and ends it with an ellipsis', () => {
    expect(fitText('a'.repeat(19), 18)).toBe(`${'a'.repeat(17)}…`)
  })

  it('does not leave a space before the ellipsis', () => {
    expect(fitText('Payments service v2', 10)).toBe('Payments…')
  })

  it('puts text on one line', () => {
    expect(fitText('  orders\n  primary  ', 18)).toBe('orders primary')
  })

  it('counts an emoji as one character', () => {
    expect(fitText('🙂🙂🙂', 2)).toBe('🙂…')
  })

  it('handles empty text', () => {
    expect(fitText('', 18)).toBe('')
  })
})

describe('cardTexts', () => {
  const database: ComponentData = {
    v: 1,
    kind: 'database',
    name: 'orders',
    props: { engine: 'PostgreSQL', replicas: 3 },
  }

  it('shows the name and the detail line', () => {
    expect(cardTexts(database)).toEqual({
      name: 'orders',
      detail: 'PostgreSQL · 3 replicas',
    })
  })

  // New components are named after their kind, numbered when taken
  // ("Database 2"), so a new card never shows a shortened name.
  it.each(Object.values(CATALOG).map((kind) => kind.label))(
    'shows the default name "%s 99" in full',
    (label) => {
      expect(cardTexts({ ...database, name: `${label} 99` }).name).toBe(
        `${label} 99`,
      )
    },
  )

  it('shortens a long name', () => {
    expect(
      cardTexts({ ...database, name: 'Primary orders database' }).name,
    ).toBe('Primary orders databa…')
  })

  it('shortens a long detail line', () => {
    const gateway: ComponentData = {
      v: 1,
      kind: 'api_gateway',
      name: 'edge',
      props: {
        basePath: '/api/v2/public',
        auth: 'OAuth',
        rateLimitPerSecond: 5000,
      },
    }
    const { detail } = cardTexts(gateway)
    expect(Array.from(detail)).toHaveLength(DETAIL_MAX_CHARACTERS)
    expect(detail.endsWith('…')).toBe(true)
  })
})
