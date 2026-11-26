import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types'
import type { Identity } from './identity'
import { startPresence, toCollaborators } from './presence'
import type { Participant, PresenceConnection } from './presence'

export function usePresence(
  identity: Identity | null,
  connection: PresenceConnection | undefined,
  api: ExcalidrawImperativeAPI | null,
) {
  const [participants, setParticipants] = useState<
    ReadonlyMap<string, Participant>
  >(new Map())
  const session = useRef<ReturnType<typeof startPresence> | null>(null)
  const identityRef = useRef(identity)

  useEffect(() => {
    identityRef.current = identity
    session.current?.setIdentity(identity)
  }, [identity])

  useEffect(() => {
    if (!connection || !api) return
    const active = startPresence(connection, identityRef.current, (next) => {
      setParticipants(next)
      api.updateScene({ collaborators: toCollaborators(next) })
    })
    session.current = active
    // Share the selection with everyone else; sorted so order changes are no-ops.
    const offChange = api.onChange((_elements, appState) => {
      active.select(Object.keys(appState.selectedElementIds).sort())
    })
    return () => {
      offChange()
      session.current = null
      active.dispose()
      api.updateScene({ collaborators: new Map() })
    }
  }, [api, connection])

  const onPointerUpdate = useCallback<
    NonNullable<ExcalidrawProps['onPointerUpdate']>
  >(({ pointer }) => {
    session.current?.pointer(pointer)
  }, [])
  return {
    participants,
    onPointerUpdate,
  }
}
