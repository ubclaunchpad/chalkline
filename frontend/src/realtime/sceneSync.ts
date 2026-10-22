import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

interface ElementVersion {
  version: number
  versionNonce: number
}

const hasSameVersion = (left: ElementVersion, right: ElementVersion): boolean =>
  left.version === right.version && left.versionNonce === right.versionNonce

/**
 * Conflict resolution rule:
 * Higher Excalidraw version wins; lower versionNonce breaks a version tie.
 */
const shouldReplaceElement = (
  current: ElementVersion,
  candidate: ElementVersion,
): boolean =>
  candidate.version > current.version ||
  (candidate.version === current.version &&
    candidate.versionNonce < current.versionNonce)

/**
 * Compares the order of two elements based on their fractional index.
 * If the indices are equal, the element with the lower ID sorts first.
 *
 * Returns -1 if left < right, 1 if left > right, and 0 if they are equal.
 */
const compareElementOrder = (
  left: OrderedExcalidrawElement,
  right: OrderedExcalidrawElement,
): number => {
  if (left.index !== right.index) {
    return left.index < right.index ? -1 : 1
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1
  }
  return 0
}

/**
 * Returns the elements whose Excalidraw version changed since the previous
 * scene. Deleted elements remain in the scene with `isDeleted: true`, so they
 * are detected in the same way as any other edit.
 */
export const changedElements = (
  previous: readonly OrderedExcalidrawElement[],
  next: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement[] => {
  const previousById = new Map(previous.map((element) => [element.id, element]))

  return next.filter((element) => {
    const previousElement = previousById.get(element.id)
    return !previousElement || !hasSameVersion(previousElement, element)
  })
}

/**
 * Merges two scene fragments into a single scene.
 * The returned order is derived from Excalidraw's fractional index so clients
 * converge even when they receive the same updates in different orders.
 */
export const mergeElements = (
  local: readonly OrderedExcalidrawElement[],
  incoming: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement[] => {
  const winners = new Map<string, OrderedExcalidrawElement>()

  for (const candidate of [...local, ...incoming]) {
    const current = winners.get(candidate.id)
    if (!current || shouldReplaceElement(current, candidate)) {
      winners.set(candidate.id, candidate)
    }
  }

  return [...winners.values()].sort(compareElementOrder)
}

export interface RemoteUpdateTracker {
  remember(elements: readonly OrderedExcalidrawElement[]): void
  filter(
    elements: readonly OrderedExcalidrawElement[],
  ): OrderedExcalidrawElement[]
  clear(): void
}

/**
 * Tracks exact remote element versions until Excalidraw reports the resulting
 * scene through `onChange`. A later local version is never suppressed.
 */
export const createRemoteUpdateTracker = (): RemoteUpdateTracker => {
  const remoteVersions = new Map<string, ElementVersion>()

  return {
    remember(elements) {
      for (const element of elements) {
        remoteVersions.set(element.id, {
          version: element.version,
          versionNonce: element.versionNonce,
        })
      }
    },

    filter(elements) {
      return elements.filter((element) => {
        const remoteVersion = remoteVersions.get(element.id)
        if (!remoteVersion) {
          return true
        }

        remoteVersions.delete(element.id)
        return !hasSameVersion(remoteVersion, element)
      })
    },

    clear() {
      remoteVersions.clear()
    },
  }
}
