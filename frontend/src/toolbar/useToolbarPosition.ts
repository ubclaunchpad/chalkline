import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  clampPosition,
  COLLAPSED_SIZE,
  defaultPosition,
  dockPlacement,
  nudgePlacement,
  parsePlacement,
  type Orientation,
  type Placement,
  type Point,
  type ToolbarLayout,
} from './position'

export const TOOLBAR_POSITION_KEY = 'chalkline.toolbarPosition'

/** Pointer travel that turns a press on the handle into a drag. */
const DRAG_THRESHOLD = 4

const loadPlacement = (): Placement | null => {
  try {
    return parsePlacement(sessionStorage.getItem(TOOLBAR_POSITION_KEY))
  } catch {
    return null
  }
}

const savePlacement = (placement: Placement | null): void => {
  try {
    if (placement) {
      sessionStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify(placement))
    } else {
      sessionStorage.removeItem(TOOLBAR_POSITION_KEY)
    }
  } catch {
    // The toolbar still works for this page when storage is unavailable.
  }
}

const measureLayout = (element: HTMLElement): ToolbarLayout | null => {
  const parent = element.parentElement
  return (
    parent && {
      bounds: { width: parent.clientWidth, height: parent.clientHeight },
      toolbar: { width: element.offsetWidth, height: element.offsetHeight },
    }
  )
}

interface MeasuredLayout {
  layout: ToolbarLayout
  orientation: Orientation
}

interface PointerDrag {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

interface MoveSession {
  origin: Placement | null
  drag: PointerDrag | null
}

/**
 * Tracks where the user wants the toolbar separately from where it renders, so
 * a temporarily smaller canvas doesn't permanently move it.
 */
export const useToolbarPosition = (onPointerMoved: () => void) => {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [measured, setMeasured] = useState<MeasuredLayout | null>(null)
  const [preferred, setPreferred] = useState<Placement | null>(loadPlacement)
  const [dragPointer, setDragPointer] = useState<Point | null>(null)
  const session = useRef<MoveSession | null>(null)
  const orientation: Orientation = preferred?.orientation ?? 'vertical'
  const isCollapsed = dragPointer !== null

  useEffect(() => {
    const parent = element?.parentElement
    if (!element || !parent) return

    const observer = new ResizeObserver(() => {
      const next = measureLayout(element)
      if (!next) return

      setMeasured((previous) =>
        // The collapsed chip must not replace the expanded toolbar's size.
        previous && element.dataset.collapsed === 'true'
          ? {
              ...previous,
              layout: { ...previous.layout, bounds: next.bounds },
            }
          : {
              layout: next,
              orientation:
                element.getAttribute('aria-orientation') === 'horizontal'
                  ? 'horizontal'
                  : 'vertical',
            },
      )
    })
    observer.observe(parent)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [element])

  // Until a pivot is remeasured, its size is the last one with the axes swapped,
  // so it never renders a frame clamped to the old shape.
  const layout: ToolbarLayout | null =
    measured &&
    (measured.orientation === orientation
      ? measured.layout
      : {
          bounds: measured.layout.bounds,
          toolbar: {
            width: measured.layout.toolbar.height,
            height: measured.layout.toolbar.width,
          },
        })

  const position = !layout
    ? null
    : dragPointer
      ? clampPosition(
          {
            x: dragPointer.x - COLLAPSED_SIZE / 2,
            y: dragPointer.y - COLLAPSED_SIZE / 2,
          },
          {
            bounds: layout.bounds,
            toolbar: { width: COLLAPSED_SIZE, height: COLLAPSED_SIZE },
          },
        )
      : clampPosition(preferred ?? defaultPosition(layout), layout)

  const canvasPoint = (event: PointerEvent<HTMLElement>): Point => {
    const canvas = element?.parentElement?.getBoundingClientRect()
    return {
      x: event.clientX - (canvas?.left ?? 0),
      y: event.clientY - (canvas?.top ?? 0),
    }
  }

  const activeDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = session.current?.drag
    return drag?.pointerId === event.pointerId ? drag : null
  }

  const cancelMove = () => {
    const current = session.current
    if (!current) return false

    session.current = null
    setDragPointer(null)
    setPreferred(current.origin)
    return true
  }

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || !position) return

      event.preventDefault()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      session.current = {
        origin: session.current ? session.current.origin : preferred,
        drag: {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        },
      }
    },

    onPointerMove(event: PointerEvent<HTMLElement>) {
      const drag = activeDrag(event)
      if (!drag) return

      if (!drag.moved) {
        const travel = Math.hypot(
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        )
        if (travel < DRAG_THRESHOLD) return
        drag.moved = true
      }
      setDragPointer(canvasPoint(event))
    },

    onPointerUp(event: PointerEvent<HTMLElement>) {
      const drag = activeDrag(event)
      if (!drag) return

      session.current = null
      // A plain click keeps focus here so arrow keys can move the toolbar.
      if (!drag.moved || !layout) return

      const next = dockPlacement(canvasPoint(event), layout, orientation)
      setDragPointer(null)
      setPreferred(next)
      savePlacement(next)
      onPointerMoved()
    },

    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (activeDrag(event)) cancelMove()
    },

    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.key === 'Escape') {
        const drag = session.current?.drag
        if (cancelMove()) {
          event.preventDefault()
          if (drag && event.currentTarget.hasPointerCapture(drag.pointerId)) {
            event.currentTarget.releasePointerCapture(drag.pointerId)
          }
        }
        return
      }

      if (session.current?.drag || !position || !layout) return

      const next = nudgePlacement(
        { ...position, orientation },
        event.key,
        event.shiftKey,
        layout,
      )
      if (!next) return

      event.preventDefault()
      session.current ??= { origin: preferred, drag: null }
      setPreferred(next)
    },

    onBlur() {
      if (session.current && !session.current.drag) {
        session.current = null
        savePlacement(preferred)
      }
    },
  }

  const reset = () => {
    session.current = null
    setPreferred(null)
    savePlacement(null)
  }

  return {
    toolbarRef: setElement,
    layout,
    position,
    orientation,
    isCollapsed,
    isMoved: preferred !== null,
    handleProps,
    reset,
  }
}
