// Runs the card text repair (see repairCardText.ts) whenever the board
// changes, at most once per animation frame. Repairs are kept out of undo:
// they only make the card show what its data already says.

import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useEffect } from 'react'
import { withChanges } from './applyComponentChange.ts'
import { planCardTextRepairs, type RepairedVersions } from './repairCardText.ts'

// Changes whenever any element does. The nonce matters: when two people edit
// one element at once, both copies have the same version and the board keeps
// one by its versionNonce, so swapping one copy for the other leaves every
// version unchanged. That swap is exactly when a card can need repairing.
const sceneFingerprint = (elements: readonly OrderedExcalidrawElement[]) =>
  elements.reduce(
    (sum, element) => sum + element.version + element.versionNonce,
    elements.length,
  )

export function useCardTextRepair(api: ExcalidrawImperativeAPI | null): void {
  useEffect(() => {
    if (!api) {
      return
    }
    const repaired: RepairedVersions = new Map()
    let checked = -1
    let frame = 0

    const repair = () => {
      frame = 0
      const elements = api.getSceneElementsIncludingDeleted()
      const fingerprint = sceneFingerprint(elements)
      if (fingerprint === checked) {
        return
      }
      checked = fingerprint
      const changed = planCardTextRepairs(elements, repaired)
      if (changed.length > 0) {
        api.updateScene({
          elements: withChanges(elements, changed),
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      }
    }

    repair()
    const unsubscribe = api.onChange(() => {
      frame ||= requestAnimationFrame(repair)
    })
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [api])
}
