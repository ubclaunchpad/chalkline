// Board actions other areas call: sticky notes, groups and connections.
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  getCommonBounds,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ConnectionKind } from '../graph/deriveGraph'
import {
  FONT,
  STICKY,
  connectionSkeleton,
  groupSkeleton,
  stickySkeleton,
  type GroupKind,
} from './look'

export type { GroupKind }

/** Adds a sticky note at the centre of the view (or at a scene point). */
export function createStickyNote(
  api: ExcalidrawImperativeAPI,
  at?: { x: number; y: number },
): void {
  const state = api.getAppState()
  const center =
    at ??
    viewportCoordsToSceneCoords(
      {
        clientX: state.offsetLeft + state.width / 2,
        clientY: state.offsetTop + state.height / 2,
      },
      state,
    )
  const [note] = convertToExcalidrawElements([stickySkeleton(center)])

  // Excalidraw starts typing into the selected shape on Enter, and the new
  // text takes the current text style. Use the note's style for that moment,
  // then give the user's style back.
  const { currentItemFontFamily, currentItemFontSize, currentItemStrokeColor } =
    state
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), note],
    appState: {
      selectedElementIds: { [note.id]: true },
      currentItemFontFamily: FONT.Excalifont,
      currentItemFontSize: 20,
      currentItemStrokeColor: STICKY.ink,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
  requestAnimationFrame(() => {
    // Excalidraw listens for keys on its own container element.
    document
      .querySelector('.excalidraw')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    api.updateScene({
      appState: {
        currentItemFontFamily,
        currentItemFontSize,
        currentItemStrokeColor,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    })
  })
}

/** Draws a group around the selected elements. */
export function groupSelection(
  api: ExcalidrawImperativeAPI,
  kind: GroupKind = 'vpc',
): void {
  const { selectedElementIds } = api.getAppState()
  const all = api.getSceneElementsIncludingDeleted()
  const selected = all.filter(
    (element) => !element.isDeleted && selectedElementIds[element.id],
  )
  if (selected.length === 0) return

  const [group, ...label] = convertToExcalidrawElements([
    groupSkeleton(getCommonBounds(selected), kind),
  ])
  // Just behind the lowest selected element, so the box sits behind its contents.
  const first = Math.min(...selected.map((element) => all.indexOf(element)))
  api.updateScene({
    elements: [...all.slice(0, first), group, ...label, ...all.slice(first)],
    appState: { selectedElementIds: { [group.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
}

/** An arrow skeleton bound to two elements, for convertToExcalidrawElements. */
export function createConnectionSkeleton(
  from: string,
  to: string,
  kind: ConnectionKind = 'call',
  label?: string,
) {
  return connectionSkeleton(from, to, kind, label)
}
