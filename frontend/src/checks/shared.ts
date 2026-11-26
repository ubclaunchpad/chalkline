// Small helpers shared by checks and review.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useBoard, useScene } from '../app/context'
import { deriveGraph } from '../graph/deriveGraph'

const SETTLE_MS = 200

/**
 * The graph, rebuilt once edits pause for a moment so dragging a box on a big
 * board doesn't re-run every rule on every frame.
 */
export function useSettledGraph() {
  const { elements } = useScene()
  const [settled, setSettled] = useState(elements)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(elements)
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [elements])
  return useMemo(
    () => ({ elements: settled, graph: deriveGraph(settled) }),
    [settled],
  )
}

/** The latest app state, refreshed (once per frame) on pan, zoom and edits. */
export function useAppState(): AppState | null {
  const { api } = useBoard()
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    if (!api) return
    let frame = 0
    const read = () => {
      frame = 0
      setState(api.getAppState())
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

/** Scene box to a box inside the board area (which starts at the canvas corner). */
export function toBoardBox(
  box: { x: number; y: number; width: number; height: number },
  state: Pick<AppState, 'scrollX' | 'scrollY' | 'zoom'>,
) {
  const zoom = state.zoom.value
  return {
    left: (box.x + state.scrollX) * zoom,
    top: (box.y + state.scrollY) * zoom,
    width: box.width * zoom,
    height: box.height * zoom,
  }
}

/** A point in scene coordinates. */
export type Point = readonly [number, number]

/** An arrow's or line's points (offsets from its x and y), if it has any. */
export function pointsOf(element: ExcalidrawElement): readonly Point[] {
  // Excalidraw's point type comes from @excalidraw/math, which isn't installed
  // on its own, so lint can't see that the cast is needed.
  return 'points' in element
    ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (element.points as unknown as readonly Point[])
    : []
}

/** Scene-space bounding box; arrows and lines use their points. */
export function sceneBox(element: ExcalidrawElement) {
  // shortcut: ignores rotation, fine while components and arrows are unrotated.
  const points = pointsOf(element)
  if (points.length > 0) {
    const xs = points.map((point) => point[0])
    const ys = points.map((point) => point[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      x: element.x + minX,
      y: element.y + minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    }
  }
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }
}

/** Selects the given elements and scrolls them into view. */
export function focusElements(
  api: ExcalidrawImperativeAPI | null,
  ids: readonly string[],
) {
  if (!api || ids.length === 0) return
  const wanted = new Set(ids)
  const targets = api
    .getSceneElements()
    .filter((element) => wanted.has(element.id))
  if (targets.length === 0) return
  api.updateScene({
    appState: {
      selectedElementIds: Object.fromEntries(
        targets.map((element) => [element.id, true as const]),
      ),
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  })
  api.scrollToContent(targets, {
    animate: true,
    fitToContent: targets.length > 1,
  })
}

// "Show on board" for checks is per browser tab, so a tiny shared store is enough.
let showChecksOnBoard = false
const listeners = new Set<() => void>()

export function useShowChecksOnBoard(): [boolean, (show: boolean) => void] {
  const show = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => showChecksOnBoard,
  )
  return [
    show,
    (next) => {
      showChecksOnBoard = next
      listeners.forEach((listener) => {
        listener()
      })
    },
  ]
}
