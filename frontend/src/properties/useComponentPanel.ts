import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useState } from 'react'
import { relabelComponent } from './componentLabel.ts'
import { fieldErrors } from './fieldErrors.ts'
import {
  selectedComponent,
  type SelectedComponent,
} from './selectedComponent.ts'
import { updateComponent, type ComponentChange } from './updateComponent.ts'

// The parts of Excalidraw's API the panel uses, so tests can pass a small fake.
export type PanelApi = Pick<
  ExcalidrawImperativeAPI,
  'getSceneElementsIncludingDeleted' | 'updateScene'
>

export interface PanelSelection extends SelectedComponent {
  // id + version, recorded when the selection was read. Excalidraw edits
  // elements in place, so comparing element.version later could compare an
  // object with itself; a string taken at the time cannot change.
  elementKey: string
}

// Errors remember which element they are for, so selecting another component
// does not show the previous one's errors.
interface PanelErrors {
  elementId: string
  errors: Record<string, string>
}

const NO_ERRORS: Readonly<Record<string, string>> = {}

export interface ComponentPanel {
  selection: PanelSelection | null
  errors: Readonly<Record<string, string>>
  onSceneChange: (
    elements: readonly OrderedExcalidrawElement[],
    appState: Pick<AppState, 'selectedElementIds'>,
  ) => void
  save: (change: ComponentChange) => void
}

// Connects the property panel to the board: tracks which component is
// selected and saves panel changes back into the scene.
export function useComponentPanel(api: PanelApi | null): ComponentPanel {
  const [selection, setSelection] = useState<PanelSelection | null>(null)
  const [panelErrors, setPanelErrors] = useState<PanelErrors | null>(null)

  // Runs on every Excalidraw change, including pointer moves, so it only
  // updates state when the selected element or its version actually changed.
  const onSceneChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: Pick<AppState, 'selectedElementIds'>,
    ) => {
      const next: SelectedComponent | null = selectedComponent(
        elements,
        appState.selectedElementIds,
      )

      setSelection((prev: PanelSelection | null) => {
        if (!next) {
          return null
        }
        const elementKey = `${next.element.id}-${String(next.element.version)}`
        // Returning prev unchanged tells React to skip the re-render.
        return prev?.elementKey === elementKey ? prev : { ...next, elementKey }
      })
    },
    [],
  )

  const save = useCallback(
    (change: ComponentChange) => {
      if (!api || !selection) {
        return
      }

      // Read the element from the scene now, not from the selection, in case
      // it changed since the selection was recorded.
      const elements: readonly OrderedExcalidrawElement[] =
        api.getSceneElementsIncludingDeleted()
      const element: OrderedExcalidrawElement | undefined = elements.find(
        (el: OrderedExcalidrawElement) => el.id === selection.element.id,
      )
      if (!element) {
        return
      }

      const result = updateComponent(element, change)
      if (!result.ok) {
        setPanelErrors({
          elementId: element.id,
          errors: fieldErrors(result.problems),
        })
        return
      }

      setPanelErrors(null)
      const updated: OrderedExcalidrawElement = result.element
      // updateComponent returns the same element when nothing changed.
      if (updated === element) {
        return
      }

      // A rename must also change the text drawn on the box, in the same
      // update, so the board never shows a stale name.
      const replacements = new Map<string, OrderedExcalidrawElement>([
        [updated.id, updated],
      ])
      const label: OrderedExcalidrawElement | null = relabelComponent(
        updated,
        elements,
      )
      if (label) {
        replacements.set(label.id, label)
      }

      // Scene sync notices the bumped versions and sends them to other clients.
      api.updateScene({
        elements: elements.map(
          (el: OrderedExcalidrawElement) => replacements.get(el.id) ?? el,
        ),
      })
    },
    [api, selection],
  )

  const errors: Readonly<Record<string, string>> =
    panelErrors && panelErrors.elementId === selection?.element.id
      ? panelErrors.errors
      : NO_ERRORS

  return { selection, errors, onSceneChange, save }
}
