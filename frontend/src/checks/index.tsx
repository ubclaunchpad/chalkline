import { useMemo } from 'react'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconListCheck,
} from '@tabler/icons-react'
import { useBoard, useScene } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { CHECK_COUNT, runChecks, type Problem } from './rules'
import {
  focusElements,
  sceneBox,
  toBoardBox,
  useAppState,
  useSettledGraph,
  useShowChecksOnBoard,
} from './shared'
import { SidePanel, topBarButtonClass } from './SidePanel'

function useProblems(): Problem[] {
  const { elements, graph } = useSettledGraph()
  return useMemo(() => runChecks(graph, elements), [graph, elements])
}

const plural = (count: number, word: string) =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`

const SEVERITY = {
  error: { icon: IconCircleX, text: 'text-danger', label: 'Error' },
  warning: { icon: IconAlertTriangle, text: 'text-warning', label: 'Warning' },
} as const

export function ChecksButton() {
  const { panel, togglePanel } = useBoard()
  const problems = useProblems()
  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.length - errors
  const summary =
    problems.length === 0
      ? 'no problems'
      : [
          errors > 0 && plural(errors, 'error'),
          warnings > 0 && plural(warnings, 'warning'),
        ]
          .filter(Boolean)
          .join(', ')
  return (
    <button
      type="button"
      aria-pressed={panel === 'checks'}
      aria-label={`Checks: ${summary}`}
      onClick={() => {
        togglePanel('checks')
      }}
      className={topBarButtonClass}
    >
      <ChalklineIcon icon={IconListCheck} size={18} />
      <span className="max-sm:hidden">Checks</span>
      {errors > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 text-danger">
          <ChalklineIcon icon={IconCircleX} size={14} />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-warning">
          <ChalklineIcon icon={IconAlertTriangle} size={14} />
          {warnings}
        </span>
      )}
      {problems.length === 0 && (
        <ChalklineIcon
          icon={IconCircleCheck}
          size={16}
          className="text-success"
        />
      )}
    </button>
  )
}

export function ChecksPanel() {
  const { api, panel, closePanel } = useBoard()
  const [showOnBoard, setShowOnBoard] = useShowChecksOnBoard()
  const problems = useProblems()
  if (panel !== 'checks') return null

  return (
    <SidePanel
      title="Checks"
      onClose={closePanel}
      headerExtra={
        <label className="flex items-center gap-2 text-label text-ink-muted">
          <input
            type="checkbox"
            checked={showOnBoard}
            onChange={(event) => {
              setShowOnBoard(event.target.checked)
            }}
            className="size-4 accent-accent"
          />
          Keep showing on the board when this panel is closed
        </label>
      }
    >
      {problems.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-success">
          <ChalklineIcon icon={IconCircleCheck} size={20} />
          All {CHECK_COUNT} checks passed
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Problems">
          {problems.map((problem) => {
            const severity = SEVERITY[problem.severity]
            return (
              <li key={problem.key}>
                <button
                  type="button"
                  onClick={() => {
                    focusElements(api, [problem.elementId])
                  }}
                  className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <ChalklineIcon
                    icon={severity.icon}
                    size={18}
                    decorative={false}
                    label={severity.label}
                    className={`mt-px shrink-0 ${severity.text}`}
                  />
                  <span>{problem.message}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </SidePanel>
  )
}

export function ChecksLayer() {
  const { panel } = useBoard()
  const [showOnBoard] = useShowChecksOnBoard()
  const visible = panel === 'checks' || showOnBoard
  return visible ? <ChecksMarks /> : null
}

const PAD = 6

function ChecksMarks() {
  const problems = useProblems()
  // Live elements so outlines stay put while a box is dragged.
  const { elements } = useScene()
  const appState = useAppState()
  const byId = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  )
  if (!appState) return null

  // One mark per element, showing its worst problem.
  const worst = new Map<string, Problem>()
  for (const problem of problems) {
    if (!worst.has(problem.elementId)) worst.set(problem.elementId, problem)
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {[...worst.values()].map((problem) => {
        const element = byId.get(problem.elementId)
        if (!element) return null
        const box = toBoardBox(sceneBox(element), appState)
        const severity = SEVERITY[problem.severity]
        return (
          <div
            key={problem.elementId}
            className={`absolute rounded-md border-2 border-dashed ${
              problem.severity === 'error' ? 'border-danger' : 'border-warning'
            }`}
            style={{
              left: box.left - PAD,
              top: box.top - PAD,
              width: box.width + PAD * 2,
              height: box.height + PAD * 2,
            }}
          >
            <span
              className={`absolute -top-3 -right-3 inline-flex size-6 items-center justify-center rounded-full border border-border bg-surface-raised ${severity.text}`}
            >
              <ChalklineIcon icon={severity.icon} size={16} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
