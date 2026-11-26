import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, stepZoom, zoomAroundCenter } from './zoom'

const state = {
  width: 800,
  height: 600,
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 },
}

// Scene point shown at the middle of the view.
const centre = (s: typeof state) => ({
  x: s.width / 2 / s.zoom.value - s.scrollX,
  y: s.height / 2 / s.zoom.value - s.scrollY,
})

describe('zoomAroundCenter', () => {
  it('keeps the scene point under the middle of the view', () => {
    const next = { ...state, ...zoomAroundCenter(state, 2) }
    expect(next.zoom.value).toBe(2)
    expect(centre(next)).toEqual(centre(state))
  })

  it('clamps to the zoom limits', () => {
    expect(zoomAroundCenter(state, 0).zoom.value).toBe(MIN_ZOOM)
    expect(zoomAroundCenter(state, 99).zoom.value).toBe(MAX_ZOOM)
  })
})

describe('stepZoom', () => {
  it('steps by tenths and snaps float noise', () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(0.3, -1)).toBe(0.2)
    expect(stepZoom(0.9500001, 1)).toBe(1.1)
  })
})
