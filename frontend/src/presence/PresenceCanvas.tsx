import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { loadIdentity, saveIdentity } from './identity'
import { CollaboratorList } from './CollaboratorList'
import { NameDialog } from './NameDialog'
import { usePresence } from './usePresence'
import type { PresenceConnection } from './presence'
import './presence.css'

// The development-only demo injects its simulated connection here. Production
// binds usePresence to the app's existing canvas in App.tsx.
export function PresenceCanvas({
  connection,
}: {
  connection?: PresenceConnection
}) {
  const [identity, setIdentity] = useState(loadIdentity)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const { connectedClientIds, identities, onPointerUpdate } = usePresence(
    identity,
    connection,
    api,
  )
  return (
    <>
      <Excalidraw
        excalidrawAPI={setApi}
        onPointerUpdate={onPointerUpdate}
        renderTopRightUI={() =>
          identity && (
            <CollaboratorList
              identity={identity}
              connectedClientIds={connectedClientIds}
              identities={identities}
            />
          )
        }
      />
      {!identity && (
        <NameDialog
          onSubmit={(next) => {
            saveIdentity(next)
            setIdentity(next)
          }}
        />
      )}
    </>
  )
}
