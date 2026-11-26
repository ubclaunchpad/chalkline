import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { BOARD_INFO_POSITION, findBoardInfo } from './boardInfo'

/** Creates or updates the board-info element so everyone sees the name. */
export function renameBoard(api: ExcalidrawImperativeAPI, name: string): void {
  const all = api.getSceneElementsIncludingDeleted()
  const info = findBoardInfo(all)
  const next = info
    ? all.map((element) =>
        element === info
          ? newElementWith(element, {
              customData: { ...element.customData, v: 1, name },
            })
          : element,
      )
    : [
        ...all,
        ...convertToExcalidrawElements([
          {
            type: 'rectangle',
            x: BOARD_INFO_POSITION,
            y: BOARD_INFO_POSITION,
            width: 1,
            height: 1,
            opacity: 0,
            locked: true,
            customData: { v: 1, annotation: 'board', name },
          },
        ]),
      ]
  api.updateScene({
    elements: next,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
}
