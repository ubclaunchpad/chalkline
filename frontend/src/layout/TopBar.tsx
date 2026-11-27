import type { ReactNode, Ref } from 'react'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'
import { Logo } from '../design/Logo'

interface TopBarProps {
  boardId: string
  componentsOpen: boolean
  onToggleComponents: () => void
  componentsButtonRef?: Ref<HTMLButtonElement>
  status: ReactNode
  participants: ReactNode
  actions?: ReactNode
}

/** Product chrome above the board. Only working actions should fill its slots. */
export function TopBar({
  boardId,
  componentsOpen,
  onToggleComponents,
  componentsButtonRef,
  status,
  participants,
  actions,
}: TopBarProps) {
  const toggleLabel = componentsOpen
    ? 'Hide components panel'
    : 'Show components panel'

  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg px-2 text-ink sm:gap-3 sm:px-3">
      <button
        ref={componentsButtonRef}
        type="button"
        aria-label={toggleLabel}
        aria-controls="component-sidebar"
        aria-expanded={componentsOpen}
        onClick={onToggleComponents}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <ChalklineIcon
          icon={
            componentsOpen
              ? IconLayoutSidebarLeftCollapse
              : IconLayoutSidebarLeftExpand
          }
          size={20}
        />
      </button>

      <Logo className="h-auto w-20 shrink-0 sm:w-28" />

      <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />

      <p
        className="min-w-0 max-w-32 truncate text-label font-semibold text-ink-muted sm:max-w-56"
        title={boardId}
      >
        <span className="sr-only">Board: </span>
        {boardId}
      </p>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {participants}
        {actions && (
          <div className="flex items-center gap-1.5 sm:gap-2">{actions}</div>
        )}
        {status}
      </div>
    </header>
  )
}
