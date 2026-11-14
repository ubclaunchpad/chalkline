import {
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { componentLabelText } from './labelText.ts'
import { readComponent } from './updateComponent.ts'

export interface Relabelled {
  // The label with its new text, wrapped and sized to fit the box.
  label: OrderedExcalidrawElement
  // The box, made taller (or wider) if the new text needed more room;
  // otherwise the same element that was passed in.
  container: OrderedExcalidrawElement
}

// Returns the component's label updated to match the component's current
// data, or null when there is nothing to update: no bound label, or the label
// already shows the right text (so no needless version bump).
export function relabelComponent(
  container: OrderedExcalidrawElement,
  elements: readonly OrderedExcalidrawElement[],
): Relabelled | null {
  const data: ComponentData | null = readComponent(container)
  if (!data) {
    return null
  }

  // The throwaway copy is built as a box, which only works for these shapes.
  if (
    container.type !== 'rectangle' &&
    container.type !== 'diamond' &&
    container.type !== 'ellipse'
  ) {
    return null
  }

  const labelId: string | undefined = container.boundElements?.find(
    (bound) => bound.type === 'text',
  )?.id
  const label: OrderedExcalidrawElement | undefined = elements.find(
    (el: OrderedExcalidrawElement) => el.id === labelId,
  )
  if (label?.type !== 'text' || label.isDeleted) {
    return null
  }

  const text: string = componentLabelText(data.name, data.kind)
  if (label.originalText === text) {
    return null
  }

  // Excalidraw does not export its text measuring, but building a shape with
  // a label measures, wraps and centres the text. So build a throwaway copy of
  // the box with the new text, read the measurements off it, and apply only
  // those to the real elements. The real ones keep their ids, so arrows,
  // selection and sync still point at them.
  const measured: readonly OrderedExcalidrawElement[] =
    convertToExcalidrawElements([
      {
        type: container.type,
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
        angle: container.angle,
        label: {
          text,
          fontSize: label.fontSize,
          fontFamily: label.fontFamily,
          textAlign: label.textAlign,
          verticalAlign: label.verticalAlign,
        },
      },
    ])
  const measuredLabel: OrderedExcalidrawElement | undefined = measured.find(
    (el: OrderedExcalidrawElement) => el.type === 'text',
  )
  const measuredBox: OrderedExcalidrawElement | undefined = measured.find(
    (el: OrderedExcalidrawElement) => el.type !== 'text',
  )
  if (measuredLabel?.type !== 'text' || !measuredBox) {
    return null
  }

  const updatedLabel: OrderedExcalidrawElement = newElementWith(label, {
    // text has line breaks added where Excalidraw wrapped it; originalText
    // keeps what was written, which Excalidraw re-wraps if the box resizes.
    text: measuredLabel.text,
    originalText: text,
    x: measuredLabel.x,
    y: measuredLabel.y,
    width: measuredLabel.width,
    height: measuredLabel.height,
  })

  // Excalidraw grows the box when the text does not fit inside it.
  const resized: boolean =
    measuredBox.width !== container.width ||
    measuredBox.height !== container.height
  const updatedContainer: OrderedExcalidrawElement = resized
    ? newElementWith(container, {
        width: measuredBox.width,
        height: measuredBox.height,
      })
    : container

  return { label: updatedLabel, container: updatedContainer }
}
