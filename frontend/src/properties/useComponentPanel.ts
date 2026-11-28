import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useMemo, useState } from 'react'
import type { ComponentData } from '../catalog/catalog.ts'
import { relabelComponent, type Relabelled } from './componentLabel.ts'
import {
  errorsAfterSave,
  errorsAfterSceneChange,
  visibleErrors,
  type PanelErrors,
} from './panelErrors.ts'
import {
  selectedComponent,
  type SelectedComponent,
} from './selectedComponent.ts'
import {
  readComponent,
  updateComponent,
  type ComponentChange,
} from './updateComponent.ts'

// The parts of Excalidraw's API the panel uses, so tests can pass a small fake.
export type PanelApi = Pick<
  ExcalidrawImperativeAPI,
  'getSceneElementsIncludingDeleted' | 'updateScene'
>

export interface PanelSelection extends SelectedComponent {
  // id + version, recorded when the selection was read, so onSceneChange can
  // skip re-rendering when nothing changed. Excalidraw edits elements in
  // place, so comparing element.version later could compare an object with
  // itself; a string taken at the time cannot change. It is not used as a
  // React key: the panel keys inputs by element id so saves keep focus.
  elementKey: string
}

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

      // Drops errors for another element, and errors whose value someone
      // else has since replaced.
      setPanelErrors((prev: PanelErrors | null) =>
        errorsAfterSceneChange(
          prev,
          next ? { elementId: next.element.id, data: next.data } : null,
        ),
      )
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
      const saved: ComponentData | null = readComponent(element)
      const problems: readonly string[] = result.ok ? [] : result.problems
      setPanelErrors((prev: PanelErrors | null) =>
        errorsAfterSave(prev, element.id, saved, change, problems),
      )
      if (!result.ok) {
        return
      }

      const updated: OrderedExcalidrawElement = result.element
      // updateComponent returns the same element when nothing changed.
      if (updated === element) {
        return
      }

      // A rename must also change the text drawn on the box, in the same
      // update, so the board never shows a stale name.
      // The box may also have grown to fit a longer name.
      const relabelled: Relabelled | null = relabelComponent(updated, elements)
      const replacements = new Map<string, OrderedExcalidrawElement>([
        [updated.id, relabelled?.container ?? updated],
      ])
      if (relabelled) {
        replacements.set(relabelled.label.id, relabelled.label)
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

  const selectedId: string | undefined = selection?.element.id
  const errors: Readonly<Record<string, string>> = useMemo(
    () => visibleErrors(panelErrors, selectedId),
    [panelErrors, selectedId],
  )

  return { selection, errors, onSceneChange, save }
}
