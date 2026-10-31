import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  collectComponentNames,
  createComponentSkeleton,
  type ScenePoint,
} from './createComponent'
import type { CatalogEntry } from './catalog'

/** Adds a new component in the middle of the currently visible board. */
export function addComponentAtCenter(
  api: ExcalidrawImperativeAPI,
  entry: CatalogEntry,
): void {
  const appState = api.getAppState()
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  )
  addComponentAtScenePoint(api, entry, center)
}

/** Adds a new component centered on the viewport point it was dropped at. */
export function addComponentAtViewportPoint(
  api: ExcalidrawImperativeAPI,
  entry: CatalogEntry,
  viewportPoint: { clientX: number; clientY: number },
): void {
  const center = viewportCoordsToSceneCoords(viewportPoint, api.getAppState())
  addComponentAtScenePoint(api, entry, center)
}

function addComponentAtScenePoint(
  api: ExcalidrawImperativeAPI,
  entry: CatalogEntry,
  center: ScenePoint,
): void {
  const existingElements = api.getSceneElements()
  const existingNames = collectComponentNames(existingElements)
  const skeleton = createComponentSkeleton(entry, center, existingNames)
  const newElements = convertToExcalidrawElements([skeleton])

  api.updateScene({
    elements: [...existingElements, ...newElements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
}
