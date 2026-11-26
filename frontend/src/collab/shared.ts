import { useEffect, useMemo, useState } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useBoard, useScene } from '../app/context'
import { COLORS, loadIdentity, type Identity } from '../presence/identity'
import { threadsOf } from './comments'

/** Shared look for top bar toggle buttons (matches the other areas). */
export const topBarButtonClass =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-label font-semibold text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring aria-pressed:bg-surface-selected aria-pressed:text-ink disabled:opacity-50'

export const plainButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-label font-semibold text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50'

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-label font-bold text-on-accent hover:bg-accent-hover active:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50'

/** The scroll and zoom needed to place things over the canvas, per frame. */
export function useViewport(): Pick<
  AppState,
  'scrollX' | 'scrollY' | 'zoom'
> | null {
  const { api } = useBoard()
  const [state, setState] = useState<Pick<
    AppState,
    'scrollX' | 'scrollY' | 'zoom'
  > | null>(null)
  useEffect(() => {
    if (!api) return
    let frame = 0
    const read = () => {
      frame = 0
      const { scrollX, scrollY, zoom } = api.getAppState()
      setState((current) =>
        current?.scrollX === scrollX &&
        current.scrollY === scrollY &&
        current.zoom.value === zoom.value
          ? current
          : { scrollX, scrollY, zoom },
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    const offChange = api.onChange(schedule)
    const offScroll = api.onScrollChange(schedule)
    return () => {
      offChange()
      offScroll()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [api])
  return state
}

export function useThreads() {
  const { elements } = useScene()
  const threads = useMemo(() => threadsOf(elements), [elements])
  const byId = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  )
  return { elements, threads, byId }
}

/** Adds or replaces elements with undo, so they sync to everyone. */
export function writeElements(
  api: ExcalidrawImperativeAPI,
  changed: readonly ExcalidrawElement[],
) {
  const byId = new Map(changed.map((element) => [element.id, element]))
  const current = api.getSceneElementsIncludingDeleted()
  const kept = current.map((element) => {
    const next = byId.get(element.id)
    byId.delete(element.id)
    return next ?? element
  })
  api.updateScene({
    elements: [...kept, ...byId.values()],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
}

/** The person posting: the name and colour chosen for presence. */
export const author = (): Identity =>
  loadIdentity() ?? { name: 'Guest', color: COLORS[0] }

/** Scene coordinates to a point inside the board area. */
export const toBoard = (
  point: { x: number; y: number },
  view: Pick<AppState, 'scrollX' | 'scrollY' | 'zoom'>,
) => ({
  left: (point.x + view.scrollX) * view.zoom.value,
  top: (point.y + view.scrollY) * view.zoom.value,
})
