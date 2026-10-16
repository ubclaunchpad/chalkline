// Fake collaborators so the board feels shared without a server.
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Collaborator, SocketId } from '@excalidraw/excalidraw/types'
import { isComponentData } from './catalog'

export type FakeTeammate = {
  id: string
  name: string
  initials: string
  background: string
  stroke: string
}

export const TEAMMATES: FakeTeammate[] = [
  {
    id: 'fake-1',
    name: 'Priya',
    initials: 'P',
    background: '#ffc9c9',
    stroke: '#e03131',
  },
  {
    id: 'fake-2',
    name: 'Sam',
    initials: 'S',
    background: '#a5d8ff',
    stroke: '#1971c2',
  },
]

function bounds(elements: readonly ExcalidrawElement[]) {
  const live = elements.filter((e) => !e.isDeleted)
  if (live.length === 0) return { minX: 0, minY: 0, maxX: 900, maxY: 500 }
  return {
    minX: Math.min(...live.map((e) => e.x)),
    minY: Math.min(...live.map((e) => e.y)),
    maxX: Math.max(...live.map((e) => e.x + e.width)),
    maxY: Math.max(...live.map((e) => e.y + e.height)),
  }
}

/** Collaborator map for time `t` (ms): cursors drift around the content. */
export function teammateFrame(
  t: number,
  elements: readonly ExcalidrawElement[],
) {
  const b = bounds(elements)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const rx = Math.max(200, (b.maxX - b.minX) / 2)
  const ry = Math.max(120, (b.maxY - b.minY) / 2)
  const components = elements.filter(
    (e) => !e.isDeleted && isComponentData(e.customData),
  )

  const map = new Map<SocketId, Collaborator>()
  TEAMMATES.forEach((mate, i) => {
    const s = t / (i === 0 ? 2300 : 3100) + i * 2
    // Every ~8s each teammate "selects" a component for a few seconds.
    const slot = Math.floor(t / 8000 + i * 0.5)
    const selecting = components.length > 0 && (t / 8000 + i * 0.5) % 1 < 0.4
    const target =
      components[(slot * 7 + i * 3) % Math.max(components.length, 1)]
    map.set(mate.id as SocketId, {
      id: mate.id,
      socketId: mate.id as SocketId,
      username: mate.name,
      color: { background: mate.background, stroke: mate.stroke },
      pointer: {
        x:
          selecting && target
            ? target.x + target.width * 0.7
            : cx + rx * Math.sin(s),
        y:
          selecting && target
            ? target.y + target.height * 0.8
            : cy + ry * Math.sin(s * 1.7),
        tool: 'pointer',
      },
      button: 'up',
      selectedElementIds: selecting && target ? { [target.id]: true } : {},
    })
  })
  return map
}
