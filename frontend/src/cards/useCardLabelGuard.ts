// Keeps Excalidraw from adding its own text label inside a component card.
// The card's main shape is an ordinary rectangle, and Excalidraw adds a label
// to a rectangle when someone clicks it with the Text tool or presses Enter
// with it selected. Both are caught here, on the element wrapping Excalidraw
// in the capture phase, before Excalidraw's handlers (which React attaches
// higher up) see them. Text elsewhere on the board still works.
//
// Not covered (known limits): a double-tap on a touch screen, and the
// right-click "Bind text" action, can still add a label.

import { viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useEffect, type RefObject } from 'react'
import { cardAt, isCard, readCardPart } from './cardParts.ts'

const isBoardCanvas = (target: EventTarget | null) =>
  target instanceof HTMLCanvasElement &&
  target.classList.contains('interactive')

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement)

export function useCardLabelGuard(
  api: ExcalidrawImperativeAPI | null,
  canvasRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const wrapper = canvasRef.current
    if (!api || !wrapper) {
      return
    }

    const block = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
    }

    // The Text tool starts a label on the shape under the pointer as soon as
    // the pointer goes down.
    const onPointerDown = (event: PointerEvent) => {
      const appState = api.getAppState()
      if (
        !isBoardCanvas(event.target) ||
        appState.activeTool.type !== 'text' ||
        appState.editingTextElement
      ) {
        return
      }
      const point = viewportCoordsToSceneCoords(event, appState)
      if (cardAt(api.getSceneElements(), point)) {
        block(event)
      }
    }

    // Enter starts a label on the one selected shape.
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        event.isComposing ||
        isTyping(event.target)
      ) {
        return
      }
      const appState = api.getAppState()
      const ids = Object.keys(appState.selectedElementIds)
      if (appState.editingTextElement || ids.length !== 1) {
        return
      }
      const elements = api.getSceneElements()
      const selected = elements.find((element) => element.id === ids[0])
      if (
        selected &&
        (readCardPart(selected) !== null || isCard(elements, selected))
      ) {
        block(event)
      }
    }

    wrapper.addEventListener('pointerdown', onPointerDown, true)
    wrapper.addEventListener('keydown', onKeyDown, true)
    return () => {
      wrapper.removeEventListener('pointerdown', onPointerDown, true)
      wrapper.removeEventListener('keydown', onKeyDown, true)
    }
  }, [api, canvasRef])
}
