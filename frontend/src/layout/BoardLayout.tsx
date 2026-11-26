import type { ReactNode } from 'react'

interface BoardLayoutProps {
  topBar: ReactNode
  leftPanel?: ReactNode
  leftPanelOpen?: boolean
  rightPanel?: ReactNode
  rightPanelOpen?: boolean
  children: ReactNode
}

/**
 * Keeps the editor mounted while product panels open around it.
 *
 * The components panel floats over the left of the board, beside the
 * floating toolbar, so opening it never resizes the canvas. Right-side panels
 * sit beside the board on wide screens and float on narrow ones. The caller
 * owns which panel is open so it can enforce the one-panel-at-a-time rule.
 */
export function BoardLayout({
  topBar,
  leftPanel,
  leftPanelOpen = false,
  rightPanel,
  rightPanelOpen = false,
  children,
}: BoardLayoutProps) {
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-canvas font-sans text-body text-ink">
      {topBar}
      <div
        className="chalkline-board relative flex min-h-0 flex-1 overflow-hidden"
        data-components-open={leftPanelOpen && leftPanel ? '' : undefined}
      >
        <main className="relative min-w-0 flex-1">
          {children}
          {leftPanel && (
            <div
              hidden={!leftPanelOpen}
              className="absolute top-3 bottom-3 left-16 z-30 max-w-[calc(100%-5rem)]"
            >
              {leftPanel}
            </div>
          )}
        </main>

        {rightPanel && (
          <div
            hidden={!rightPanelOpen}
            className="z-20 h-full shrink-0 overflow-hidden max-md:absolute max-md:top-20 max-md:right-2 max-md:bottom-20 max-md:h-auto max-md:w-56 max-md:rounded-xl max-md:border max-md:border-border max-md:shadow-xl"
          >
            {rightPanel}
          </div>
        )}
      </div>
    </div>
  )
}
