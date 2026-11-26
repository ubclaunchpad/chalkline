import type { AppState } from '@excalidraw/excalidraw/types'
import {
  IconArrowUpRight,
  IconBoxMultiple,
  IconComponents,
  IconHandStop,
  IconNote,
  IconPointer,
  IconSquare,
  IconTypography,
  type Icon,
} from '@tabler/icons-react'
import { useBoard } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { createStickyNote, groupSelection } from '../elements/actions'
import { openComponentsPanel } from './componentsPanel'
import { FLOATING_PANEL, TOOL_BUTTON } from './styles'
import { Tooltip } from './Tooltip'
import { useAppStateValue } from './useAppState'

type ToolType = 'selection' | 'hand' | 'rectangle' | 'arrow' | 'text'

const TOOLS: { type: ToolType; label: string; key: string; icon: Icon }[] = [
  { type: 'selection', label: 'Select', key: 'V', icon: IconPointer },
  { type: 'hand', label: 'Hand', key: 'H', icon: IconHandStop },
  { type: 'rectangle', label: 'Rectangle', key: 'R', icon: IconSquare },
  { type: 'arrow', label: 'Arrow', key: 'A', icon: IconArrowUpRight },
  { type: 'text', label: 'Text', key: 'T', icon: IconTypography },
]

const activeTool = (state: AppState) => state.activeTool.type
const hasSelection = (state: AppState) =>
  Object.keys(state.selectedElementIds).length > 0

/** Vertical tool strip floating over the left edge of the board. */
export function FloatingToolbar() {
  const { api, access } = useBoard()
  const current = useAppStateValue(activeTool, 'selection')
  const canGroup = useAppStateValue(hasSelection, false)
  if (access === 'view') return null

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      className={`absolute top-1/2 left-3 z-40 flex -translate-y-1/2 flex-col gap-1 p-1 ${FLOATING_PANEL}`}
    >
      {TOOLS.map((tool) => {
        const active = current === tool.type
        return (
          <Tooltip key={tool.type} label={tool.label} shortcut={tool.key}>
            <button
              type="button"
              aria-label={tool.label}
              aria-pressed={active}
              aria-keyshortcuts={tool.key}
              disabled={!api}
              onClick={() => {
                api?.setActiveTool({ type: tool.type })
              }}
              className={`${TOOL_BUTTON} ${active ? 'bg-accent/20 text-accent hover:bg-accent/25 hover:text-accent' : ''}`}
            >
              <ChalklineIcon icon={tool.icon} size={20} />
            </button>
          </Tooltip>
        )
      })}

      <div aria-hidden="true" className="mx-2 my-0.5 h-px bg-border" />

      <Tooltip label="Sticky note">
        <button
          type="button"
          aria-label="Sticky note"
          disabled={!api}
          onClick={() => {
            if (api) createStickyNote(api)
          }}
          className={TOOL_BUTTON}
        >
          <ChalklineIcon icon={IconNote} size={20} />
        </button>
      </Tooltip>
      <Tooltip label="Group selection">
        <button
          type="button"
          aria-label="Group selection"
          disabled={!api || !canGroup}
          onClick={() => {
            if (api) groupSelection(api)
          }}
          className={TOOL_BUTTON}
        >
          <ChalklineIcon icon={IconBoxMultiple} size={20} />
        </button>
      </Tooltip>
      <Tooltip label="Add component">
        <button
          type="button"
          aria-label="Add component"
          onClick={openComponentsPanel}
          className={TOOL_BUTTON}
        >
          <ChalklineIcon icon={IconComponents} size={20} />
        </button>
      </Tooltip>
    </div>
  )
}
