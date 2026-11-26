import {
  useCallback,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  IconArrowUpRight,
  IconComponents,
  IconGripHorizontal,
  IconGripVertical,
  IconHandStop,
  IconPointer,
  IconRestore,
  IconShape,
  IconSquare,
  IconTypography,
  type Icon,
} from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'
import { COMPONENT_SIDEBAR_ID } from '../sidebar/catalog'
import {
  finishOpenPath,
  focusExcalidraw,
  useActiveTool,
  useArrowCompletion,
  type ToolbarApi,
} from './excalidrawAdapter'
import { linesThatFit } from './position'
import { useToolbarPosition } from './useToolbarPosition'
import './FloatingToolbar.css'

interface ToolDefinition {
  type: 'selection' | 'hand' | 'rectangle' | 'arrow' | 'text'
  label: string
  shortcut: string
  icon: Icon
}

// Shortcuts are Excalidraw 0.18.1's own; this list only labels them.
const TOOLS: readonly ToolDefinition[] = [
  { type: 'selection', label: 'Select', shortcut: 'V', icon: IconPointer },
  { type: 'hand', label: 'Pan', shortcut: 'H', icon: IconHandStop },
  { type: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: IconSquare },
  { type: 'arrow', label: 'Arrow', shortcut: 'A', icon: IconArrowUpRight },
  { type: 'text', label: 'Text', shortcut: 'T', icon: IconTypography },
]

const CONTROL_SIZE = 36
/** The grip's track meets the 24px minimum target size from WCAG 2.2. */
const HANDLE_LENGTH = 24
/**
 * Icons sit 8px inside their buttons. When the grip is last, the same 8px
 * after it keeps the toolbar's edge as far from the grip as its neighbour icon.
 */
const HANDLE_END_SPACE = 8
const CONTROL_GAP = 4
const TOOLBAR_PADDING = 4

const CONTROL_CLASS =
  'group relative inline-flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring aria-pressed:bg-surface-selected aria-pressed:text-accent aria-expanded:text-accent'

type TooltipSide = 'left' | 'right' | 'top' | 'bottom'

const TOOLTIP_SIDE_CLASS: Record<TooltipSide, string> = {
  right: 'top-1/2 left-full ml-2 -translate-y-1/2',
  left: 'top-1/2 right-full mr-2 -translate-y-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
}

function Tooltip({
  id,
  side,
  children,
}: {
  id: string
  side: TooltipSide
  children: ReactNode
}) {
  return (
    <span
      id={id}
      role="tooltip"
      className={`pointer-events-none absolute z-20 hidden rounded-sm border border-border bg-surface-overlay px-2 py-1 text-label whitespace-nowrap text-ink shadow group-hover:block group-focus-visible:block ${TOOLTIP_SIDE_CLASS[side]}`}
    >
      {children}
    </span>
  )
}

interface FloatingToolbarProps {
  api: ToolbarApi | null
  componentsOpen: boolean
  onToggleComponents: () => void
}

export function FloatingToolbar({
  api,
  componentsOpen,
  onToggleComponents,
}: FloatingToolbarProps) {
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const activeTool = useActiveTool(api)
  useArrowCompletion(api, rootRef)
  const {
    toolbarRef,
    layout,
    position,
    orientation,
    isCollapsed,
    isOnLeftEdge,
    isMoved,
    handleProps,
    reset,
  } = useToolbarPosition(() => {
    focusExcalidraw(rootRef.current)
  })
  const isVertical = orientation === 'vertical'
  const ActiveIcon =
    TOOLS.find((tool) => tool.type === activeTool)?.icon ?? IconShape
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      toolbarRef(node)
    },
    [toolbarRef],
  )

  // Tools, components, the move handle, and reset once the toolbar has moved.
  const controlCount = TOOLS.length + (isMoved ? 3 : 2)
  const available = layout
    ? isVertical
      ? layout.bounds.height
      : layout.bounds.width
    : Number.POSITIVE_INFINITY
  const fitLines = (length: number) =>
    linesThatFit(
      length,
      controlCount,
      CONTROL_SIZE,
      CONTROL_GAP,
      TOOLBAR_PADDING,
    )
  // In a single line, the grip's track is shorter than a button. Once controls
  // wrap, it shares a track with a button, so it takes a full cell.
  const handleLength = HANDLE_LENGTH + (isMoved ? 0 : HANDLE_END_SPACE)
  const fitsOneLine =
    fitLines(available + CONTROL_SIZE - handleLength) === controlCount
  const handleIsLast = fitsOneLine && !isMoved
  const gridTemplate = fitsOneLine
    ? `repeat(${String(TOOLS.length + 1)}, ${String(CONTROL_SIZE)}px) ${String(handleLength)}px${
        isMoved ? ` ${String(CONTROL_SIZE)}px` : ''
      }`
    : `repeat(${String(fitLines(available))}, ${String(CONTROL_SIZE)}px)`
  const controlClass = isCollapsed ? 'hidden' : CONTROL_CLASS

  const pastMiddle =
    layout &&
    position &&
    (isVertical
      ? position.x > layout.bounds.width / 2
      : position.y > layout.bounds.height / 2)
  const tooltipSide: TooltipSide = isVertical
    ? pastMiddle
      ? 'left'
      : 'right'
    : pastMiddle
      ? 'top'
      : 'bottom'

  // detail is 0 for keyboard clicks, which should keep focus in the toolbar.
  const returnPointerFocus = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) focusExcalidraw(rootRef.current)
  }

  return (
    <div
      ref={setRoot}
      role="toolbar"
      aria-label="Board tools"
      aria-orientation={orientation}
      data-collapsed={isCollapsed}
      data-left-edge={isOnLeftEdge}
      className={`floating-toolbar absolute top-0 left-0 z-10 flex rounded-xl border border-border bg-surface-raised p-1 shadow-lg ${
        position ? '' : 'invisible'
      }`}
      style={{
        transform: position
          ? `translate(${String(position.x)}px, ${String(position.y)}px)`
          : undefined,
      }}
    >
      {isCollapsed && (
        <span
          data-toolbar-active-tool
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-md bg-surface-selected text-accent"
        >
          <ChalklineIcon icon={ActiveIcon} size={20} />
        </span>
      )}

      <div
        data-toolbar-controls
        className={`gap-1 ${isCollapsed ? 'contents' : 'grid'} ${
          isVertical
            ? 'auto-cols-max grid-flow-col'
            : 'auto-rows-max grid-flow-row'
        }`}
        style={
          isVertical
            ? { gridTemplateRows: gridTemplate }
            : { gridTemplateColumns: gridTemplate }
        }
      >
        {TOOLS.map((tool) => {
          const tooltipId = `${baseId}-${tool.type}`
          return (
            <button
              key={tool.type}
              type="button"
              aria-label={tool.label}
              aria-pressed={activeTool === tool.type}
              aria-keyshortcuts={tool.shortcut}
              aria-describedby={tooltipId}
              className={controlClass}
              onClick={(event) => {
                if (api) {
                  finishOpenPath(api, rootRef.current)
                  api.setActiveTool({ type: tool.type })
                }
                returnPointerFocus(event)
              }}
            >
              <ChalklineIcon icon={tool.icon} size={20} />
              <Tooltip id={tooltipId} side={tooltipSide}>
                {tool.label} ({tool.shortcut})
              </Tooltip>
            </button>
          )
        })}

        <button
          type="button"
          aria-label="Components"
          aria-expanded={componentsOpen}
          aria-controls={COMPONENT_SIDEBAR_ID}
          aria-describedby={`${baseId}-components`}
          className={controlClass}
          onClick={(event) => {
            onToggleComponents()
            returnPointerFocus(event)
          }}
        >
          <ChalklineIcon icon={IconComponents} size={20} />
          <Tooltip id={`${baseId}-components`} side={tooltipSide}>
            {componentsOpen ? 'Hide components' : 'Show components'}
          </Tooltip>
        </button>

        <button
          ref={handleRef}
          type="button"
          aria-label="Move toolbar"
          aria-describedby={`${baseId}-move`}
          className={`group flex touch-none items-center justify-center rounded-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring ${
            isCollapsed
              ? 'absolute inset-0 z-10 cursor-grabbing'
              : // Only the unmoved, vertical toolbar ends with the grip.
                `relative size-full cursor-grab ${handleIsLast ? 'pb-2' : ''}`
          }`}
          {...handleProps}
        >
          {!isCollapsed && (
            <>
              <ChalklineIcon
                icon={isVertical ? IconGripHorizontal : IconGripVertical}
                size={16}
                className="shrink-0"
              />
              <Tooltip id={`${baseId}-move-label`} side={tooltipSide}>
                Move toolbar
              </Tooltip>
            </>
          )}
          <span id={`${baseId}-move`} className="sr-only">
            Drag or use arrow keys. Escape cancels.
          </span>
        </button>

        {isMoved && (
          <button
            type="button"
            aria-label="Reset toolbar position"
            aria-describedby={`${baseId}-reset`}
            className={controlClass}
            onClick={(event) => {
              // The button disappears, so keep keyboard focus on the toolbar.
              handleRef.current?.focus()
              reset()
              returnPointerFocus(event)
            }}
          >
            <ChalklineIcon icon={IconRestore} size={18} />
            <Tooltip id={`${baseId}-reset`} side={tooltipSide}>
              Reset position
            </Tooltip>
          </button>
        )}
      </div>
    </div>
  )
}
