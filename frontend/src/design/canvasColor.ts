// Excalidraw's dark theme shows the canvas through the CSS filter
// `invert(93%) hue-rotate(180deg)`, so a colour stored on an element is not
// the colour people see. canvasColor(hex) gives the colour to store so that
// `hex` is what appears on screen. Colours the filter can't reach are clamped.

const INVERT = 0.93

// CSS hue-rotate(180deg) matrix (cos = -1, sin = 0).
const HUE_180 = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
] as const

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const toRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

const toHex = (rgb: readonly number[]) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(clamp(c) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

function solve3(m: readonly (readonly number[])[], v: readonly number[]) {
  const det = (a: readonly (readonly number[])[]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const d = det(m)
  // Cramer's rule: swap column i for v.
  return [0, 1, 2].map(
    (i) => det(m.map((row, r) => row.map((x, c) => (c === i ? v[r] : x)))) / d,
  )
}

/** What the dark-theme filter shows for a stored colour. */
export function onScreen(stored: string): string {
  const inverted = toRgb(stored).map((c) => INVERT + c * (1 - 2 * INVERT))
  return toHex(
    HUE_180.map((row) =>
      clamp(row[0] * inverted[0] + row[1] * inverted[1] + row[2] * inverted[2]),
    ),
  )
}

/** The colour to store so `shown` is what appears on the dark canvas. */
export function canvasColor(shown: string): string {
  const inverted = solve3(HUE_180, toRgb(shown))
  return toHex(inverted.map((c) => (c - INVERT) / (1 - 2 * INVERT)))
}
