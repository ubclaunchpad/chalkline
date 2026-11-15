import { useState } from 'react'
import type { ConnectionStatus as Status } from './connection'
import { useConnectionStatus } from './useBoardConnection'

function appearanceFor(status: Status, hasOpened: boolean) {
  if (status === 'open') return { label: 'Connected', dot: 'bg-green-500' }
  // Before the first open the app is still starting up; after it, live
  // editing has been lost and is coming back.
  return hasOpened
    ? { label: 'Reconnecting…', dot: 'bg-red-500' }
    : { label: 'Connecting…', dot: 'bg-amber-500' }
}

/**
 * A small badge in the top-right corner of the canvas that tells people
 * whether live editing is on. Must be inside a `BoardConnectionProvider`.
 */
export function ConnectionStatus() {
  const status = useConnectionStatus()
  const [hasOpened, setHasOpened] = useState(false)
  // Remember the first open, so a later drop reads "Reconnecting…".
  if (status === 'open' && !hasOpened) setHasOpened(true)

  const { label, dot } = appearanceFor(status, hasOpened)

  return (
    <div
      role="status"
      className="pointer-events-none absolute top-16 right-4 z-10 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm text-gray-700 shadow"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {label}
    </div>
  )
}
