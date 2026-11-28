// In dark theme Excalidraw draws the whole canvas, SVG images included,
// through the CSS filter `invert(93%) hue-rotate(180deg)` (THEME_FILTER in
// Excalidraw 0.18.1). A colour stored on an element is therefore not the
// colour people see. canvasColor converts "the colour to show" into "the
// colour to store"; darkThemeColor does the opposite, for tests and for
// checking whether a colour can be shown at all.
//
// CSS filter functions work on sRGB channel values, so the maths below does
// too. invert(93%) maps every channel into 0.07–0.93, so colours with a
// channel brighter than about 237 or darker than about 18 (out of 255) can
// only be approximated; canvasColor returns the closest colour it can.

const INVERT_AMOUNT = 0.93

// hue-rotate(180deg) from the Filter Effects spec, with cos = -1 and sin = 0.
// It equals 2L - I, where L projects onto luminance (L·L = L), so it is its
// own inverse.
const HUE_ROTATE_180 = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
] as const

type Rgb = readonly [number, number, number]

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function parseHex(hex: string): Rgb {
  if (!HEX_COLOR.test(hex)) {
    throw new Error(`expected a #rrggbb colour, got ${hex}`)
  }
  return [1, 3, 5].map(
    (start) => parseInt(hex.slice(start, start + 2), 16) / 255,
  ) as unknown as Rgb
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(clamp(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function rotateHue(rgb: Rgb): Rgb {
  return HUE_ROTATE_180.map(
    (row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2],
  ) as unknown as Rgb
}

/** The colour people see in dark theme for a colour stored on the canvas. */
export function darkThemeColor(stored: string): string {
  const inverted = parseHex(stored).map(
    (channel) => INVERT_AMOUNT + channel * (1 - 2 * INVERT_AMOUNT),
  ) as unknown as Rgb
  return toHex(rotateHue(inverted).map(clamp) as unknown as Rgb)
}

/** The colour to store on the canvas so people see `shown` in dark theme. */
export function canvasColor(shown: string): string {
  const inverted = rotateHue(parseHex(shown))
  return toHex(
    inverted.map(
      (channel) => (INVERT_AMOUNT - channel) / (2 * INVERT_AMOUNT - 1),
    ) as unknown as Rgb,
  )
}
