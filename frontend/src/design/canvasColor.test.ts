import { describe, expect, it } from 'vitest'
import { canvasColor, darkThemeColor } from './canvasColor.ts'

// Largest difference in any channel, out of 255.
function channelDistance(left: string, right: string): number {
  return Math.max(
    ...[1, 3, 5].map((start) =>
      Math.abs(
        parseInt(left.slice(start, start + 2), 16) -
          parseInt(right.slice(start, start + 2), 16),
      ),
    ),
  )
}

describe('canvasColor', () => {
  // Dark-theme tokens from index.css that cards draw on the canvas.
  it.each([
    ['surface-raised', '#283349'],
    ['border', '#2b3650'],
    ['ink-muted', '#a9b6cf'],
    ['accent', '#81a6ee'],
  ])('shows %s as its token colour in dark theme', (_name, token) => {
    expect(
      channelDistance(darkThemeColor(canvasColor(token)), token),
    ).toBeLessThanOrEqual(1)
  })

  // invert(93%) cannot produce a channel above about 237 out of 255.
  it('gets as close as the dark filter allows for colours out of its range', () => {
    const ink = '#f2f6fd'
    const shown = darkThemeColor(canvasColor(ink))

    expect(shown).toBe('#ededed')
    expect(channelDistance(shown, ink)).toBeLessThanOrEqual(16)
  })

  it('stores light colours for dark ones, so light theme shows a light card', () => {
    expect(canvasColor('#283349')).toBe('#cddaf4')
  })

  it('returns lowercase #rrggbb', () => {
    expect(canvasColor('#81A6EE')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each(['81a6ee', '#fff', '#81a6eeff', 'blue'])('rejects %s', (value) => {
    expect(() => canvasColor(value)).toThrow('expected a #rrggbb colour')
  })
})

describe('darkThemeColor', () => {
  it('inverts black to the filter’s lightest grey and white to its darkest', () => {
    expect(darkThemeColor('#000000')).toBe('#ededed')
    expect(darkThemeColor('#ffffff')).toBe('#121212')
  })
})
