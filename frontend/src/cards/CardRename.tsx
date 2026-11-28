// Renaming a component by double-clicking its name on the card. The card's
// text is locked (so arrows bind to the card, not its text), and Excalidraw
// would only "enter" the card's group on a double-click, so this listens for
// the double-click itself and shows a small box over the name while typing.
// The card stays native; the box exists only during the rename.

import {
  CaptureUpdateAction,
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { validateComponent } from '../catalog/validate.ts'
import { fieldErrors } from '../properties/fieldErrors.ts'
import { focusBoard } from '../toolbar/excalidrawAdapter.ts'
import { applyComponentChange, withChanges } from './applyComponentChange.ts'
import { cardAt, findCardParts } from './cardParts.ts'

/** A card's name text element and its component data, if both are live. */
function findNameLine(
  elements: readonly ExcalidrawElement[],
  containerId: string,
): {
  name: Extract<ExcalidrawElement, { type: 'text' }>
  data: ComponentData
} | null {
  const container = elements.find((element) => element.id === containerId)
  const name = container && findCardParts(elements, container).name
  const result = container && validateComponent(container.customData)
  return name?.type === 'text' && result?.ok
    ? { name, data: result.data }
    : null
}

/** The message shown under the box: the panel's message for the name field. */
function renameError(problems: readonly string[]): string {
  const errors = fieldErrors(problems)
  return Object.hasOwn(errors, 'name') ? errors.name : problems[0]
}

interface Editing {
  containerId: string
  value: string
  error: string | null
}

interface CardRenameProps {
  api: ExcalidrawImperativeAPI | null
  /** The element wrapping Excalidraw; double-clicks are caught here. */
  canvasRef: RefObject<HTMLElement | null>
}

export function CardRename({ api, canvasRef }: CardRenameProps) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [, redraw] = useState(0)
  // Set once the rename is saved or cancelled, so the blur that follows when
  // the box disappears does not save it again.
  const finished = useRef(false)
  const errorId = useId()

  useEffect(() => {
    const wrapper = canvasRef.current
    if (!api || !wrapper) {
      return
    }
    const onDoubleClick = (event: MouseEvent) => {
      // Only double-clicks on the board itself, not on toolbars or menus.
      const target = event.target
      if (
        !(target instanceof HTMLCanvasElement) ||
        !target.classList.contains('interactive')
      ) {
        return
      }
      const appState = api.getAppState()
      if (
        appState.activeTool.type !== 'selection' ||
        appState.viewModeEnabled ||
        appState.editingTextElement
      ) {
        return
      }
      const hit = cardAt(
        api.getSceneElements(),
        viewportCoordsToSceneCoords(event, appState),
      )
      if (!hit) {
        return
      }
      // Capture phase on the wrapper runs before Excalidraw's handler, which
      // React attaches higher up, so Excalidraw never sees this double-click.
      // Excalidraw would "enter" the card's group, and a second double-click
      // would add a stray text label inside the card, so double-clicks
      // anywhere on a card stop here. Only the name line opens the box.
      event.preventDefault()
      event.stopPropagation()
      if (!hit.onName) {
        return
      }
      finished.current = false
      setEditing({
        containerId: hit.container.id,
        value: hit.data.name,
        error: null,
      })
    }
    wrapper.addEventListener('dblclick', onDoubleClick, true)
    return () => {
      wrapper.removeEventListener('dblclick', onDoubleClick, true)
    }
  }, [api, canvasRef])

  // Keep the box over the name while the board scrolls, zooms or changes, and
  // close it if the card goes away (for example, someone else deletes it).
  const editingId = editing?.containerId ?? null
  useEffect(() => {
    if (!api || editingId === null) {
      return
    }
    return api.onChange(() => {
      if (findNameLine(api.getSceneElements(), editingId)) {
        redraw((count) => count + 1)
      } else {
        finished.current = true
        setEditing(null)
        focusBoard(canvasRef.current)
      }
    })
  }, [api, canvasRef, editingId])

  const found =
    api && editing
      ? findNameLine(api.getSceneElements(), editing.containerId)
      : null
  if (!api || !editing || !found) {
    return null
  }
  const { name, data } = found

  const close = (returnFocus: boolean) => {
    finished.current = true
    setEditing(null)
    if (returnFocus) {
      focusBoard(canvasRef.current)
    }
  }

  const save = (leaving: boolean) => {
    if (finished.current) {
      return
    }
    const scene = api.getSceneElementsIncludingDeleted()
    const result = applyComponentChange(scene, editing.containerId, {
      name: editing.value,
    })
    if (!result.ok) {
      if (leaving) {
        // Clicking away from an invalid name keeps the old one.
        close(false)
      } else {
        setEditing({ ...editing, error: renameError(result.problems) })
      }
      return
    }
    if (result.elements.length > 0) {
      api.updateScene({
        elements: withChanges(scene, result.elements),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
    }
    close(!leaving)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Excalidraw adds some key listeners on the document and window; keep
    // typing in the box away from them.
    event.stopPropagation()
    // Enter that confirms an input-method composition is not a save.
    if (event.nativeEvent.isComposing) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      save(false)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    }
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEditing({ ...editing, value: event.target.value, error: null })
  }

  const appState = api.getAppState()
  const zoom = appState.zoom.value
  const position = sceneCoordsToViewportCoords(
    { sceneX: name.x, sceneY: name.y },
    appState,
  )
  // Sized from the name line itself, so it still fits a resized card.
  const fontSize = name.fontSize * zoom

  return (
    <div
      className="fixed z-50"
      style={{ left: position.x, top: position.y, width: name.width * zoom }}
    >
      <input
        // The person just double-clicked here to type.
        autoFocus
        aria-label={`Rename ${data.name}`}
        aria-invalid={editing.error !== null}
        aria-describedby={editing.error ? errorId : undefined}
        value={editing.value}
        onChange={onChange}
        onFocus={(event) => {
          event.target.select()
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          save(true)
        }}
        className="block w-full rounded-sm bg-surface-raised p-0 text-ink outline-2 outline-focus-ring"
        style={{ fontSize, lineHeight: 1.25 }}
      />
      {editing.error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 rounded-sm bg-surface-overlay px-2 py-1 text-label text-danger"
        >
          {editing.error}
        </p>
      )}
    </div>
  )
}
