// Decides which background fixes the scene needs: card labels that follow
// their component data, arrows that become connections and look like their
// kind, labels that follow connection and group data, and card icons. Pure,
// so it can be tested; ElementEffects measures text and writes the result.
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from '@excalidraw/excalidraw/element/types'
import type { ComponentData, ComponentKind } from '../catalog/catalog'
import { validateComponent } from '../catalog/validate'
import { cardLabel } from './describe'
import { cardIdOfIcon, iconFileId, iconIdFor, iconPosition } from './icons'
import {
  CARD_LABEL,
  CONNECTION_BASE,
  CONNECTION_LABEL,
  GROUP_LABEL,
  connectionStyle,
  readConnectionKind,
  type LabelStyle,
} from './look'

export type Patch = Record<string, unknown>

export interface LabelJob {
  containerId: string
  /** Empty text means the label should go. */
  text: string
  style: LabelStyle
}

export interface IconJob {
  cardId: string
  kind: ComponentKind
  x: number
  y: number
}

export interface Plan {
  patches: Map<string, Patch>
  labels: LabelJob[]
  icons: IconJob[]
}

export interface PlanInput {
  /** Text element being typed into on this client; left alone. */
  editingId: string | null
  /** Text element this client just finished editing; its text is adopted. */
  finishedId: string | null
  /** Arrows still being drawn; left alone until they are placed. */
  busyIds: ReadonlySet<string>
  /**
   * Last label text applied per container. A label is rewritten only when
   * its data changes, so another person's typing is never overwritten.
   */
  seen: Map<string, string>
}

type Data = Record<string, unknown>

const asData = (value: unknown): Data | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Data)
    : null

function readCard(element: ExcalidrawElement): ComponentData | null {
  if (element.type === 'arrow' || element.type === 'text') return null
  const result = validateComponent(element.customData)
  return result.ok ? result.data : null
}

export function planEffects(
  elements: readonly ExcalidrawElement[],
  { editingId, finishedId, busyIds, seen }: PlanInput,
): Plan {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const plan: Plan = { patches: new Map(), labels: [], icons: [] }
  const patch = (id: string, fields: Patch) => {
    plan.patches.set(id, { ...plan.patches.get(id), ...fields })
  }

  const boundText = (container: ExcalidrawElement) => {
    const ref = container.boundElements?.find((bound) => bound.type === 'text')
    const text = ref && byId.get(ref.id)
    return text && !text.isDeleted && text.type === 'text' ? text : null
  }
  const finishedContainer = finishedId
    ? (byId.get(finishedId) as ExcalidrawTextElement | undefined)?.containerId
    : undefined

  // Keeps a container's label equal to `desired`, written by this client only
  // when the data changed or this client just edited the label.
  const syncLabel = (
    container: ExcalidrawElement,
    desired: string,
    style: LabelStyle,
  ) => {
    const text = boundText(container)
    const changed = seen.get(container.id) !== desired
    seen.set(container.id, desired)
    if (text?.id === editingId && editingId) return
    const force = finishedContainer === container.id
    if ((changed || force) && (text?.originalText ?? '') !== desired) {
      plan.labels.push({ containerId: container.id, text: desired, style })
    }
  }
  // The text this client just typed into the container, if any.
  const typed = (container: ExcalidrawElement) =>
    finishedContainer === container.id
      ? (boundText(container)?.originalText.trim() ?? '')
      : null

  for (const element of elements) {
    if (element.isDeleted || busyIds.has(element.id)) continue

    const card = readCard(element)
    if (card) {
      let data = card
      const name = typed(element)?.split('\n')[0]?.trim()
      if (name && name !== data.name) {
        const renamed = validateComponent({ ...data, name })
        if (renamed.ok) {
          data = renamed.data
          patch(element.id, { customData: data })
        }
      }
      syncLabel(element, cardLabel(data), CARD_LABEL)

      const at = iconPosition(element)
      const icon = byId.get(iconIdFor(element.id))
      if (!icon) {
        plan.icons.push({ cardId: element.id, kind: data.kind, ...at })
      } else if (
        icon.isDeleted ||
        icon.x !== at.x ||
        icon.y !== at.y ||
        (icon.type === 'image' && icon.fileId !== iconFileId(data.kind))
      ) {
        patch(icon.id, {
          ...at,
          isDeleted: false,
          fileId: iconFileId(data.kind),
        })
      }
      continue
    }

    const data = asData(element.customData)

    if (element.type === 'arrow') {
      if (!data) {
        const from = element.startBinding?.elementId
        const to = element.endBinding?.elementId
        const fromCard = from && byId.get(from)
        const toCard = to && byId.get(to)
        if (
          fromCard &&
          toCard &&
          !fromCard.isDeleted &&
          !toCard.isDeleted &&
          readCard(fromCard) &&
          readCard(toCard)
        ) {
          // A label typed on the arrow before it was connected is kept.
          const label = boundText(element)?.originalText.trim()
          patch(element.id, {
            customData: {
              v: 1,
              annotation: 'connection',
              kind: 'call',
              ...(label ? { label } : {}),
            },
            ...CONNECTION_BASE,
            ...connectionStyle('call'),
          })
        }
        continue
      }
      if (data.annotation !== 'connection') continue

      const style = connectionStyle(readConnectionKind(data))
      if (
        element.strokeStyle !== style.strokeStyle ||
        element.startArrowhead !== style.startArrowhead ||
        element.endArrowhead !== style.endArrowhead
      ) {
        patch(element.id, { ...style })
      }

      let label = typeof data.label === 'string' ? data.label : ''
      const text = typed(element)
      if (text !== null && text !== label) {
        const next: Data = { ...data, label: text }
        if (!text) delete next.label
        patch(element.id, { customData: next })
        label = text
      }
      syncLabel(element, label, CONNECTION_LABEL)
      continue
    }

    if (data?.annotation === 'group' && typeof data.name === 'string') {
      let name = data.name
      const text = typed(element)
      if (text && text !== name) {
        patch(element.id, { customData: { ...data, name: text } })
        name = text
      }
      syncLabel(element, name, GROUP_LABEL)
    }
  }

  // Icons whose card was deleted or stopped being a component go too.
  for (const element of elements) {
    const cardId = cardIdOfIcon(element.id)
    if (cardId === null || element.isDeleted) continue
    const card = byId.get(cardId)
    if (!card || card.isDeleted || !readCard(card)) {
      patch(element.id, { isDeleted: true })
    }
  }

  return plan
}
