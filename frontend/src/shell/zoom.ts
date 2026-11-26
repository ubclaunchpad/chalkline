import type { AppState } from '@excalidraw/excalidraw/types'

// Same limits Excalidraw's own zoom buttons use.
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 30
export const ZOOM_STEP = 0.1

type ZoomState = Pick<AppState, 'width' | 'height' | 'scrollX' | 'scrollY'> & {
  zoom: { value: number }
}

/** Scroll and zoom that keep the middle of the view still while zooming. */
export function zoomAroundCenter(state: ZoomState, nextZoom: number) {
  const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
  const current = state.zoom.value
  const cx = state.width / 2
  const cy = state.height / 2
  return {
    zoom: { value: value as AppState['zoom']['value'] },
    scrollX: state.scrollX + cx / value - cx / current,
    scrollY: state.scrollY + cy / value - cy / current,
  }
}

/** The next step up or down, snapped to tenths so 100% is always reachable. */
export function stepZoom(current: number, direction: 1 | -1): number {
  return Math.round((current + direction * ZOOM_STEP) * 10) / 10
}
