import type { AppState } from '@excalidraw/excalidraw/types'
import { IconMaximize, IconMinus, IconPlus } from '@tabler/icons-react'
import { useBoard } from '../app/context'
import { isOnCanvas } from '../layout/boardInfo'
import { ChalklineIcon } from '../design/Icon'
import { FLOATING_PANEL, TOOL_BUTTON } from './styles'
import { Tooltip } from './Tooltip'
import { useAppStateValue } from './useAppState'
import { stepZoom, zoomAroundCenter } from './zoom'

const zoomValue = (state: AppState) => state.zoom.value

const SMALL_BUTTON = TOOL_BUTTON.replace('size-10', 'size-8')

/** Zoom out, level (click for 100%), zoom in and fit, bottom right. */
export function ZoomControls() {
  const { api } = useBoard()
  const zoom = useAppStateValue<number>(zoomValue, 1)
  const percent = `${String(Math.round(zoom * 100))}%`

  const zoomTo = (next: number) => {
    if (!api) return
    api.updateScene({ appState: zoomAroundCenter(api.getAppState(), next) })
  }

  const fit = () => {
    if (!api) return
    const visible = api.getSceneElements().filter(isOnCanvas)
    if (visible.length === 0) return
    api.scrollToContent(visible, { fitToContent: true, animate: true })
  }

  return (
    <div
      role="group"
      aria-label="Zoom"
      className={`absolute right-3 bottom-3 z-20 flex items-center gap-0.5 p-1 ${FLOATING_PANEL}`}
    >
      <Tooltip label="Zoom out" shortcut="Ctrl −" side="top">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!api}
          onClick={() => {
            zoomTo(stepZoom(zoom, -1))
          }}
          className={SMALL_BUTTON}
        >
          <ChalklineIcon icon={IconMinus} size={18} />
        </button>
      </Tooltip>
      <Tooltip label="Reset to 100%" side="top">
        <button
          type="button"
          aria-label={`Zoom ${percent}, reset to 100%`}
          disabled={!api}
          onClick={() => {
            zoomTo(1)
          }}
          className="h-8 min-w-14 rounded-lg px-1 text-label font-semibold text-ink tabular-nums transition-colors hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        >
          {percent}
        </button>
      </Tooltip>
      <Tooltip label="Zoom in" shortcut="Ctrl +" side="top">
        <button
          type="button"
          aria-label="Zoom in"
          disabled={!api}
          onClick={() => {
            zoomTo(stepZoom(zoom, 1))
          }}
          className={SMALL_BUTTON}
        >
          <ChalklineIcon icon={IconPlus} size={18} />
        </button>
      </Tooltip>
      <div aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      <Tooltip label="Fit to content" side="topEnd">
        <button
          type="button"
          aria-label="Fit to content"
          disabled={!api}
          onClick={fit}
          className={SMALL_BUTTON}
        >
          <ChalklineIcon icon={IconMaximize} size={18} />
        </button>
      </Tooltip>
    </div>
  )
}
