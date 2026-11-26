import type { ReactNode } from 'react'

const SIDE = {
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  topEnd: 'bottom-full right-0 mb-2',
} as const

/**
 * Hover and focus label for an icon-only control. The control keeps its own
 * aria-label; this is visual only.
 */
export function Tooltip({
  label,
  shortcut,
  side = 'right',
  children,
}: {
  label: string
  shortcut?: string
  side?: keyof typeof SIDE
  children: ReactNode
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute z-50 flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2 py-1 text-label whitespace-nowrap text-ink opacity-0 shadow-lg transition-opacity delay-150 group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100 ${SIDE[side]}`}
      >
        {label}
        {shortcut && (
          <kbd className="rounded-sm bg-surface-overlay px-1 font-mono text-[0.6875rem] text-ink-muted">
            {shortcut}
          </kbd>
        )}
      </span>
    </span>
  )
}
