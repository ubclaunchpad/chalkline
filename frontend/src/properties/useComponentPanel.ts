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

// Just what the panel uses, so tests can fake it.
export type PanelApi = Pick<
  ExcalidrawImperativeAPI,
  'getSceneElementsIncludingDeleted' | 'updateScene'
>

export interface PanelSelection extends SelectedComponent {
  // id + version, captured as a string because Excalidraw mutates elements.
  // Only for skipping re-renders; not a React key.
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

// Tracks the selected component and saves panel changes to the scene.
export function useComponentPanel(api: PanelApi | null): ComponentPanel {
  const [selection, setSelection] = useState<PanelSelection | null>(null)
  const [panelErrors, setPanelErrors] = useState<PanelErrors | null>(null)

  // Runs on every change, pointer moves included, so it skips no-op updates.
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
        return prev?.elementKey === elementKey ? prev : { ...next, elementKey }
      })

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

      // Read fresh: the selection's copy may be stale.
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
      // Same element means nothing changed.
      if (updated === element) {
        return
      }

      // Relabel (and maybe resize) the box in the same update.
      const relabelled: Relabelled | null = relabelComponent(updated, elements)
      const replacements = new Map<string, OrderedExcalidrawElement>([
        [updated.id, relabelled?.container ?? updated],
      ])
      if (relabelled) {
        replacements.set(relabelled.label.id, relabelled.label)
      }

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
