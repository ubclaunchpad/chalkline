import { useEffect, useState } from 'react'
import type { ConnectionStatus as Status } from './connection'
import { useBoardConnection, useConnectionStatus } from './useBoardConnection'

function appearanceFor(status: Status, hasOpened: boolean) {
  if (status === 'open') return { label: 'Connected', dot: 'bg-success' }
  // Before the first open the app is still starting up; after it, live
  // editing has been lost and is coming back.
  return hasOpened
    ? { label: 'Reconnecting…', dot: 'bg-danger' }
    : { label: 'Connecting…', dot: 'bg-warning' }
}

/**
 * A compact live-editing status for the product bar. Must be inside a
 * `BoardConnectionProvider`.
 */
export function ConnectionStatus() {
  const status = useConnectionStatus()
  const connection = useBoardConnection()
  // The server refused our key, so the connection will not retry.
  const [refused, setRefused] = useState(false)
  useEffect(
    () =>
      connection?.on('error', (message) => {
        if (message.code === 'key_required') setRefused(true)
      }),
    [connection],
  )
  const [hasOpened, setHasOpened] = useState(status === 'open')
  // Remember the first open, so a later drop reads "Reconnecting…".
  if (status === 'open' && !hasOpened) setHasOpened(true)

  const { label, dot } =
    refused && status === 'closed'
      ? { label: 'Needs a share link', dot: 'bg-danger' }
      : appearanceFor(status, hasOpened)

  return (
    <div
      role="status"
      className="pointer-events-none flex h-9 items-center gap-1.5 rounded-md bg-surface-raised px-2 text-label font-bold text-ink-muted"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {label}
    </div>
  )
}
