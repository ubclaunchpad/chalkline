import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types'
import type { Identity } from './identity'
import { startPresence, toCollaborators } from './presence'
import type { PresenceConnection } from './presence'

export function usePresence(
  identity: Identity | null,
  connection: PresenceConnection | undefined,
  api: ExcalidrawImperativeAPI | null,
) {
  const [connectedClientIds, setConnectedClientIds] = useState<
    ReadonlySet<string>
  >(new Set())
  const [identities, setIdentities] = useState<ReadonlyMap<string, Identity>>(
    new Map(),
  )
  const session = useRef<ReturnType<typeof startPresence> | null>(null)

  useEffect(() => {
    if (!connection || !api) return
    const active = startPresence(
      connection,
      null,
      (next) => {
        api.updateScene({ collaborators: toCollaborators(next) })
      },
      {
        onMembership: setConnectedClientIds,
        onIdentities: setIdentities,
      },
    )
    session.current = active
    return () => {
      session.current = null
      active.dispose()
      api.updateScene({ collaborators: new Map() })
    }
  }, [api, connection])

  useEffect(() => {
    session.current?.setIdentity(identity)
  }, [identity])

  const onPointerUpdate = useCallback<
    NonNullable<ExcalidrawProps['onPointerUpdate']>
  >(({ pointer }) => {
    session.current?.pointer(pointer)
  }, [])
  return {
    connectedClientIds,
    identities,
    onPointerUpdate,
  }
}
