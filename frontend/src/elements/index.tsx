// Headless effects that keep cards, connections and groups looking like what
// their data says. Writes use CaptureUpdateAction.NEVER so they stay out of
// undo, and only happen when planEffects finds something that differs.
import { useEffect } from 'react'
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useBoard } from '../app/context'
import { iconFileId, iconFiles, iconIdFor } from './icons'
import { CARD } from './look'
import { planEffects, type LabelJob, type Plan } from './plan'

export function ElementEffects() {
  const { api, access } = useBoard()

  useEffect(() => {
    if (!api) return
    // Files are not synced, so every viewer registers the icon images.
    api.addFiles(iconFiles())
    if (access !== 'edit') return

    const seen = new Map<string, string>()
    let editing: string | null = null
    let frame = 0
    const run = () => {
      frame = 0
      const state = api.getAppState()
      const now = state.editingTextElement?.id ?? null
      const finishedId = editing !== now ? editing : null
      editing = now
      const busyIds = new Set<string>()
      for (const id of [
        state.newElement?.id,
        state.multiElement?.id,
        state.editingLinearElement?.elementId,
      ]) {
        if (id) busyIds.add(id)
      }
      const plan = planEffects(api.getSceneElementsIncludingDeleted(), {
        editingId: now,
        finishedId,
        busyIds,
        seen,
      })
      applyPlan(api, plan)
    }
    let off: (() => void) | undefined
    let stopped = false
    // Labels are measured when written, so wait for their fonts first
    // (jsdom in tests has no document.fonts).
    const fonts = ['16px Nunito', '14px Cascadia', '20px Excalifont']
    void Promise.allSettled(
      'fonts' in document ? fonts.map((font) => document.fonts.load(font)) : [],
    ).then(() => {
      if (stopped) return
      run()
      off = api.onChange(() => {
        if (!frame) frame = requestAnimationFrame(run)
      })
    })
    return () => {
      stopped = true
      off?.()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [api, access])

  return null
}

function applyPlan(api: ExcalidrawImperativeAPI, plan: Plan): void {
  if (!plan.patches.size && !plan.labels.length && !plan.icons.length) return

  const elements: ExcalidrawElement[] = [
    ...api.getSceneElementsIncludingDeleted(),
  ]
  const at = new Map(elements.map((element, i) => [element.id, i]))
  const get = (id: string) => {
    const i = at.get(id)
    return i === undefined ? undefined : elements[i]
  }
  const update = (
    element: ExcalidrawElement,
    fields: Partial<ExcalidrawElement>,
  ) => {
    const i = at.get(element.id)
    if (i !== undefined) elements[i] = newElementWith(element, fields as never)
  }
  // New elements go right after the element they belong to.
  const inserts: { after: string; element: ExcalidrawElement }[] = []

  for (const [id, fields] of plan.patches) {
    const element = get(id)
    if (element) update(element, fields)
  }

  for (const job of plan.labels) {
    const container = get(job.containerId)
    if (!container) continue
    const ref = container.boundElements?.find((bound) => bound.type === 'text')
    const old = ref ? get(ref.id) : undefined
    const text = old && !old.isDeleted ? old : undefined

    if (!job.text) {
      if (text) update(text, { isDeleted: true })
      update(container, {
        boundElements:
          container.boundElements?.filter((b) => b !== ref) ?? null,
      })
      continue
    }

    const measured = measureLabel(container, job)
    if (!measured) continue
    if (text) {
      const { text: wrapped, originalText, x, y, width, height } = measured.text
      const { fontFamily, fontSize, lineHeight, strokeColor } = measured.text
      const { textAlign, verticalAlign } = measured.text
      update(text, {
        ...{ text: wrapped, originalText, x, y, width, height },
        ...{ fontFamily, fontSize, lineHeight, strokeColor },
        ...{ textAlign, verticalAlign },
      })
    } else {
      const label = { ...measured.text, containerId: container.id }
      inserts.push({ after: container.id, element: label })
      update(container, {
        boundElements: [
          ...(container.boundElements?.filter((b) => b.type !== 'text') ?? []),
          { type: 'text', id: label.id },
        ],
      })
    }
    // Excalidraw grows a shape to fit its text; keep that.
    const latest = get(container.id)
    if (latest && latest.type !== 'arrow' && measured.height > latest.height) {
      update(latest, { height: measured.height })
    }
  }

  for (const icon of plan.icons) {
    const [image] = convertToExcalidrawElements(
      [
        {
          type: 'image',
          id: iconIdFor(icon.cardId),
          x: icon.x,
          y: icon.y,
          width: CARD.iconSize,
          height: CARD.iconSize,
          fileId: iconFileId(icon.kind),
          status: 'saved',
          locked: true,
        },
      ],
      { regenerateIds: false },
    )
    inserts.push({ after: icon.cardId, element: image })
  }

  for (const { after, element } of inserts) {
    elements.splice(elements.findIndex((e) => e.id === after) + 1, 0, element)
  }
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })
}

// Lets Excalidraw wrap and place the text by converting a stand-in copy of
// the container with the label, then reads the result.
function measureLabel(
  container: ExcalidrawElement,
  job: LabelJob,
): { text: ExcalidrawTextElement; height: number } | null {
  const label = { text: job.text, ...job.style }
  const { x, y, width, height } = container
  const skeleton =
    container.type === 'arrow'
      ? { type: 'arrow', x, y, points: container.points, label }
      : { type: container.type, x, y, width, height, label }
  const converted = convertToExcalidrawElements([
    skeleton as ExcalidrawElementSkeleton,
  ])
  const text = converted.find((element) => element.type === 'text')
  return text ? { text, height: converted[0]?.height ?? height } : null
}
