import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { loadIdentity, saveIdentity } from './identity'
import { CollaboratorList } from './CollaboratorList'
import { NameDialog } from './NameDialog'
import { usePresence } from './usePresence'
import type { PresenceConnection } from './presence'
import './presence.css'

// #27 will pass the app's existing shared connection here. Until then this
// renders only the local identity, with no simulated people or extra socket.
export function PresenceCanvas({
  connection,
}: {
  connection?: PresenceConnection
}) {
  const [identity, setIdentity] = useState(loadIdentity)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const { participants, onPointerUpdate } = usePresence(
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
            <CollaboratorList identity={identity} participants={participants} />
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
