import {
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ComponentData } from '../catalog/catalog.ts'
import { componentLabelText } from './labelText.ts'
import { readComponent } from './updateComponent.ts'

export interface Relabelled {
  label: OrderedExcalidrawElement
  // Resized if the text needed room; otherwise the same element.
  container: OrderedExcalidrawElement
}

// The label (and box) updated to the component's name, or null if unchanged.
export function relabelComponent(
  container: OrderedExcalidrawElement,
  elements: readonly OrderedExcalidrawElement[],
): Relabelled | null {
  const data: ComponentData | null = readComponent(container)
  if (!data) {
    return null
  }

  // The measuring copy only works for these shapes.
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

  // Excalidraw doesn't export text measuring, so measure a throwaway copy and
  // copy its sizes onto the real elements, which keep their ids.
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
    // text is wrapped; originalText is re-wrapped if the box resizes.
    text: measuredLabel.text,
    originalText: text,
    x: measuredLabel.x,
    y: measuredLabel.y,
    width: measuredLabel.width,
    height: measuredLabel.height,
  })

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
