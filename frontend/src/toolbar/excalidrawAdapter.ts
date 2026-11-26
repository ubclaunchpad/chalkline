import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import './excalidrawAdapter.css'

export type ToolbarApi = Pick<
  ExcalidrawImperativeAPI,
  'getAppState' | 'onChange' | 'onPointerUp' | 'setActiveTool'
>

const noSubscription = () => () => undefined

const containerIn = (canvas: HTMLElement | null | undefined) =>
  canvas?.querySelector<HTMLElement>('.excalidraw-container') ?? null

const excalidrawContainer = (toolbar: HTMLElement | null) =>
  containerIn(toolbar?.parentElement)

/** Reads the active tool from Excalidraw so buttons and shortcuts always agree. */
export const useActiveTool = (api: ToolbarApi | null): string | null => {
  const subscribe = useCallback(
    (notify: () => void) => api?.onChange(notify) ?? noSubscription(),
    [api],
  )
  return useSyncExternalStore(
    api ? subscribe : noSubscription,
    () => api?.getAppState().activeTool.type ?? null,
  )
}

/**
 * Excalidraw only handles shortcuts while focus is inside its container, so a
 * pointer click on a toolbar button hands focus back to keep shortcuts working.
 */
export const focusExcalidraw = (toolbar: HTMLElement | null): void => {
  excalidrawContainer(toolbar)?.focus({ preventScroll: true })
}

/** Gives the board keyboard focus so its shortcuts work without a click first. */
export const focusBoard = (canvas: HTMLElement | null): void => {
  containerIn(canvas)?.focus({ preventScroll: true })
}

// Excalidraw 0.18.1's tool shortcuts.
const TOOL_SHORTCUT = /^[vhrdaolpxte0-9]$/i

/**
 * Finishes an arrow or line that is still following the pointer. Excalidraw
 * 0.18.1 has no public API for this, so it uses the same Escape action as the
 * keyboard, which also drops the unplaced point under the cursor.
 */
export const finishOpenPath = (
  api: ToolbarApi,
  toolbar: HTMLElement | null,
): void => {
  if (!api.getAppState().multiElement) return

  excalidrawContainer(toolbar)?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  )
}

/**
 * Ends a clicked arrow on its second click, and finishes open paths before a
 * tool shortcut because Excalidraw ignores those shortcuts until then.
 */
export const useArrowCompletion = (
  api: ToolbarApi | null,
  toolbarRef: RefObject<HTMLElement | null>,
): void => {
  useEffect(() => {
    if (!api) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.onPointerUp(() => {
      clearTimeout(timer)
      // Excalidraw commits the clicked point after its pointer-up listeners.
      timer = setTimeout(() => {
        const open = api.getAppState().multiElement
        // A zero-length arrow would be deleted, so keep it open for another click.
        const committed = open?.lastCommittedPoint as
          readonly [number, number] | null | undefined
        if (
          open?.type === 'arrow' &&
          committed &&
          (committed[0] !== 0 || committed[1] !== 0)
        ) {
          finishOpenPath(api, toolbarRef.current)
        }
      }, 0)
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        TOOL_SHORTCUT.test(event.key)
      ) {
        finishOpenPath(api, toolbarRef.current)
      }
    }
    const container = excalidrawContainer(toolbarRef.current)
    container?.addEventListener('keydown', onKeyDown, true)

    return () => {
      clearTimeout(timer)
      unsubscribe()
      container?.removeEventListener('keydown', onKeyDown, true)
    }
  }, [api, toolbarRef])
}
