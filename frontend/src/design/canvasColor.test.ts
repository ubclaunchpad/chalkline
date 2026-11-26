import { describe, expect, it } from 'vitest'
import { canvasColor, onScreen } from './canvasColor'

// Distance between two hex colours, per channel, out of 255.
const gap = (a: string, b: string) =>
  Math.max(
    ...[1, 3, 5].map((i) =>
      Math.abs(
        parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16),
      ),
    ),
  )

describe('canvasColor', () => {
  it.each(['#283349', '#a9b6cf', '#d8e3fa', '#2d3a53', '#81a6ee'])(
    'stores %s so the dark canvas shows it',
    (shown) => {
      expect(gap(onScreen(canvasColor(shown)), shown)).toBeLessThanOrEqual(2)
    },
  )

  it('gets as close as the filter allows to near-white', () => {
    // The filter never shows anything brighter than about 93% white.
    expect(gap(onScreen(canvasColor('#f2f6fd')), '#f2f6fd')).toBeLessThan(20)
  })

  it('matches Excalidraw: stored white shows as near-black', () => {
    expect(onScreen('#ffffff')).toBe('#121212')
  })
})
