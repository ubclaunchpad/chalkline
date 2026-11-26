import { useEffect, useMemo, useState } from 'react'
import { IconPlayerPlay, IconPlayerStop, IconX } from '@tabler/icons-react'
import type { AppState } from '@excalidraw/excalidraw/types'
import { useBoard, useScene } from '../app/context'
import { nodeAt } from '../checks/rules'
import {
  pointsOf,
  sceneBox,
  toBoardBox,
  useAppState,
  useSettledGraph,
} from '../checks/shared'
import { ChalklineIcon } from '../design/Icon'
import { deriveGraph } from '../graph/deriveGraph'
import {
  easeInOut,
  flowHops,
  hopDuration,
  pointAlong,
  stepStarts,
  type Hop,
  type Point,
} from './flowHops'

/** How long the lit result stays after the last hop. */
const LINGER_MS = 2500
const MESSAGE_MS = 3500

interface Run {
  start: string
  hops: Hop[]
  starts: number[]
  startedAt: number
}

/**
 * "Send request": with one component selected, dots travel along its arrows
 * ring by ring and each component lights up as a dot reaches it. Nothing is
 * saved or sent; the animation lives only in this browser.
 */
export function FlowLayer() {
  const { api } = useBoard()
  const { elements, selectedIds } = useScene()
  const { graph } = useSettledGraph()
  const appState = useAppState()
  const [run, setRun] = useState<Run | null>(null)
  const [now, setNow] = useState(0)
  const [message, setMessage] = useState('')

  const selected =
    selectedIds.length === 1 ? nodeAt(graph, selectedIds[0] ?? '') : undefined

  useEffect(() => {
    if (!run) return
    const end = (run.starts.at(-1) ?? 0) + LINGER_MS
    let frame = requestAnimationFrame(function tick(time) {
      if (time - run.startedAt > end) {
        setRun(null)
        return
      }
      setNow(time)
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [run])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => {
      setMessage('')
    }, MESSAGE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [message])

  const send = () => {
    if (!api || !selected) return
    // Fresh graph so a just-drawn arrow counts.
    const hops = flowHops(deriveGraph(api.getSceneElements()), selected.id)
    if (hops.length === 0) {
      setMessage(`Nothing is connected from ${selected.name} yet.`)
      return
    }
    const startedAt = performance.now()
    setNow(startedAt)
    setMessage(
      `Request from ${selected.name} reaches ${String(hops.length)} component${hops.length === 1 ? '' : 's'}.`,
    )
    setRun({ start: selected.id, hops, starts: stepStarts(hops), startedAt })
  }

  const running = run !== null
  const finished =
    run !== null && now - run.startedAt >= (run.starts.at(-1) ?? 0)

  return (
    <>
      {run && appState && (
        <FlowDrawing
          run={run}
          elapsed={now - run.startedAt}
          elements={elements}
          appState={appState}
        />
      )}
      {(selected !== undefined || running) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2">
          <p
            role="status"
            className={`rounded-md bg-surface-raised px-3 py-1.5 text-label text-ink shadow-lg ${message ? '' : 'sr-only'}`}
          >
            {message}
          </p>
          <button
            type="button"
            onClick={() => {
              if (running) {
                setRun(null)
                setMessage('')
              } else {
                send()
              }
            }}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-surface-raised px-4 font-semibold text-ink shadow-lg hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <ChalklineIcon
              icon={
                running ? (finished ? IconX : IconPlayerStop) : IconPlayerPlay
              }
              size={18}
            />
            {running ? (finished ? 'Clear' : 'Stop') : 'Send request'}
          </button>
        </div>
      )}
    </>
  )
}

const toBoard = (point: Point, state: AppState): Point => {
  const box = toBoardBox(
    { x: point[0], y: point[1], width: 0, height: 0 },
    state,
  )
  return [box.left, box.top]
}

function FlowDrawing({
  run,
  elapsed,
  elements,
  appState,
}: {
  run: Run
  elapsed: number
  elements: ReturnType<typeof useScene>['elements']
  appState: AppState
}) {
  const byId = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  )
  const lit = new Set([run.start])
  const paths: { hop: Hop; points: Point[]; t: number }[] = []

  for (const hop of run.hops) {
    const startAt = run.starts[hop.step] ?? 0
    if (elapsed < startAt) continue
    const t = Math.min((elapsed - startAt) / hopDuration(hop), 1)
    if (t >= 1) lit.add(hop.to)
    const arrow = byId.get(hop.edgeId)
    // The arrow may have been deleted mid-run; just skip it.
    if (!arrow) continue
    const points = pointsOf(arrow).map(([x, y]): Point =>
      toBoard([arrow.x + x, arrow.y + y], appState),
    )
    paths.push({ hop, points: hop.reverse ? points.reverse() : points, t })
  }

  const zoom = appState.zoom.value
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 size-full overflow-hidden text-accent"
    >
      {[...lit].map((id) => {
        const element = byId.get(id)
        if (!element) return null
        const box = toBoardBox(sceneBox(element), appState)
        const pad = 6
        return (
          <rect
            key={id}
            x={box.left - pad}
            y={box.top - pad}
            width={box.width + pad * 2}
            height={box.height + pad * 2}
            rx={10 * zoom}
            fill="currentColor"
            fillOpacity={0.12}
            stroke="currentColor"
            strokeWidth={3}
            style={{ filter: 'drop-shadow(0 0 8px currentColor)' }}
          />
        )
      })}
      {paths.map(({ hop, points, t }) => {
        const [x, y] = pointAlong(points, easeInOut(t))
        return (
          <g key={hop.edgeId}>
            <polyline
              points={points.map((point) => point.join(',')).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeOpacity={t >= 1 ? 0.35 : 0.6}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={hop.async ? '8 8' : undefined}
            />
            {t < 1 && (
              <circle
                cx={x}
                cy={y}
                r={hop.async ? 5 : 7}
                fill={hop.async ? 'var(--color-canvas)' : 'currentColor'}
                stroke="currentColor"
                strokeWidth={3}
                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
