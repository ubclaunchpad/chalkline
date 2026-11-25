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
 * On narrow screens panels float between Excalidraw's top toolbar and bottom
 * zoom controls. The caller owns which panel is open so it can enforce the
 * one-panel-at-a-time rule as more panels are added.
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
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {leftPanel && (
          <div
            hidden={!leftPanelOpen}
            className="z-20 h-full shrink-0 overflow-hidden max-md:absolute max-md:top-20 max-md:bottom-20 max-md:left-2 max-md:h-auto max-md:w-56 max-md:rounded-xl max-md:border max-md:border-border max-md:shadow-xl"
          >
            {leftPanel}
          </div>
        )}

        <main className="relative min-w-0 flex-1">{children}</main>

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
