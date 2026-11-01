import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef } from 'react'
import type { BoardConnection } from './connection'
import {
  changedElements,
  createRemoteUpdateTracker,
  mergeElements,
} from './sceneSync'

export const SCENE_SEND_INTERVAL_MS = 50
const REMOTE_CAPTURE_UPDATE = 'NEVER' as const

export interface SceneSyncApi {
  getSceneElementsIncludingDeleted: () => readonly OrderedExcalidrawElement[]
  updateScene: (scene: {
    elements: readonly OrderedExcalidrawElement[]
    captureUpdate: typeof REMOTE_CAPTURE_UPDATE
  }) => void
}

interface SceneSyncControllerOptions {
  api: SceneSyncApi
  send: (elements: readonly OrderedExcalidrawElement[]) => void
  subscribe: (
    handler: (elements: readonly OrderedExcalidrawElement[]) => void,
  ) => () => void
  intervalMs?: number
}

export interface SceneSyncController {
  onSceneChange(elements: readonly OrderedExcalidrawElement[]): void
  dispose(): void
}

interface ElementVersion {
  version: number
  versionNonce: number
}

const snapshotVersions = (
  elements: readonly OrderedExcalidrawElement[],
): Map<string, ElementVersion> =>
  new Map(
    elements.map((element) => [
      element.id,
      { version: element.version, versionNonce: element.versionNonce },
    ]),
  )

const changedSince = (
  previous: ReadonlyMap<string, ElementVersion>,
  elements: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement[] =>
  elements.filter((element) => {
    const version = previous.get(element.id)
    return (
      version?.version !== element.version ||
      version.versionNonce !== element.versionNonce
    )
  })

/** Coordinates Excalidraw scene changes with one board connection. */
export const createSceneSyncController = ({
  api,
  send,
  subscribe,
  intervalMs = SCENE_SEND_INTERVAL_MS,
}: SceneSyncControllerOptions): SceneSyncController => {
  // Excalidraw mutates active elements in place, so retaining its element
  // objects would also mutate our "previous" scene and hide later versions.
  let previousVersions = snapshotVersions(
    api.getSceneElementsIncludingDeleted(),
  )
  let pendingElements: OrderedExcalidrawElement[] = []
  let sendTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const remoteUpdates = createRemoteUpdateTracker()

  const flushPendingElements = () => {
    sendTimer = undefined
    const elements = pendingElements
    pendingElements = []

    if (!disposed && elements.length > 0) {
      send(elements)
    }
  }

  const queueElements = (elements: readonly OrderedExcalidrawElement[]) => {
    if (elements.length === 0) return

    pendingElements = mergeElements(pendingElements, elements)
    sendTimer ??= setTimeout(flushPendingElements, intervalMs)
  }

  const unsubscribe = subscribe((incoming) => {
    if (disposed) return

    const local = api.getSceneElementsIncludingDeleted()
    const merged = mergeElements(local, incoming)
    const appliedRemoteElements = changedElements(local, merged)
    if (appliedRemoteElements.length === 0) return

    remoteUpdates.remember(appliedRemoteElements)
    api.updateScene({
      elements: merged,
      captureUpdate: REMOTE_CAPTURE_UPDATE,
    })
  })

  return {
    onSceneChange(elements) {
      if (disposed) return

      const changes = changedSince(previousVersions, elements)
      previousVersions = snapshotVersions(elements)
      queueElements(remoteUpdates.filter(changes))
    },

    dispose() {
      if (disposed) return

      disposed = true
      unsubscribe()
      clearTimeout(sendTimer)
      sendTimer = undefined
      pendingElements = []
      remoteUpdates.clear()
    },
  }
}

/** Connects Excalidraw's `onChange` callback to the shared board connection. */
export const useSceneSync = (
  connection: BoardConnection | null,
  api: ExcalidrawImperativeAPI | null,
): ((elements: readonly OrderedExcalidrawElement[]) => void) => {
  const controllerRef = useRef<SceneSyncController | null>(null)

  useEffect(() => {
    if (connection === null || api === null) return

    const controller = createSceneSyncController({
      api,
      send: (elements) => {
        connection.send({ type: 'change', elements })
      },
      subscribe: (handler) =>
        connection.on('change', (message) => {
          handler(message.elements)
        }),
    })
    controllerRef.current = controller

    return () => {
      controller.dispose()
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [api, connection])

  return useCallback((elements) => {
    controllerRef.current?.onSceneChange(elements)
  }, [])
}
