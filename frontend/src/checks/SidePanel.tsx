import type { ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'

/** The right-side panel frame used by checks and review. */
export function SidePanel({
  title,
  onClose,
  headerExtra,
  children,
}: {
  title: string
  onClose: () => void
  headerExtra?: ReactNode
  children: ReactNode
}) {
  return (
    <aside
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="flex h-full w-80 flex-col border-l border-border bg-surface text-ink max-md:w-full"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <h2 className="text-body font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()} panel`}
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>
      {headerExtra && (
        <div className="shrink-0 border-b border-border px-4 py-2">
          {headerExtra}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}

/** Shared look for top bar toggle buttons. */
export const topBarButtonClass =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-label font-semibold text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring aria-pressed:bg-surface-selected aria-pressed:text-ink'
