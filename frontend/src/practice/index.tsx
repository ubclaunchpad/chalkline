// Practice mode: system-design exercises with a timer, hints, and a rubric
// checked live from the diagram.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  IconBulb,
  IconCircleCheck,
  IconCircleX,
  IconPlayerPause,
  IconPlayerPlay,
  IconSchool,
  IconX,
} from '@tabler/icons-react'
import { useBoard, useScene } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { deriveGraph } from '../graph/deriveGraph'
import { drawableElements } from '../export/scene'
import { EXERCISES, type Exercise } from './exercises'
import {
  elapsed,
  formatClock,
  loadProgress,
  saveProgress,
  toggleTimer,
  type Progress,
} from './progress'

const buttonBase =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-label font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring'
const primaryButton = `${buttonBase} bg-accent text-on-accent hover:bg-accent-hover`
const outlineButton = `${buttonBase} border border-border text-ink hover:bg-surface-overlay`
const plainButton = `${buttonBase} text-ink-muted hover:bg-surface-overlay hover:text-ink`

export function PracticeButton() {
  const { panel, togglePanel } = useBoard()
  return (
    <button
      type="button"
      aria-pressed={panel === 'practice'}
      onClick={() => {
        togglePanel('practice')
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-label font-semibold text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring aria-pressed:bg-surface-selected aria-pressed:text-ink"
    >
      <ChalklineIcon icon={IconSchool} size={18} />
      <span className="max-sm:sr-only">Practice</span>
    </button>
  )
}

export function PracticePanel() {
  const { panel, closePanel, boardId } = useBoard()
  const [progress, setProgressState] = useState(() => loadProgress(boardId))
  const setProgress = (next: Progress | null) => {
    setProgressState(next)
    saveProgress(boardId, next)
  }
  if (panel !== 'practice') return null

  const exercise = EXERCISES.find((e) => e.id === progress?.exerciseId)
  return (
    <aside
      aria-labelledby="practice-heading"
      className="flex h-full w-80 flex-col border-l border-border bg-surface text-ink max-md:w-full"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 id="practice-heading" className="font-bold">
          Practice
        </h2>
        <button
          type="button"
          aria-label="Close practice"
          onClick={closePanel}
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {progress && exercise ? (
          <ActiveExercise
            exercise={exercise}
            progress={progress}
            onChange={setProgress}
          />
        ) : (
          <ExerciseList
            onStart={(id) => {
              setProgress({
                exerciseId: id,
                elapsedMs: 0,
                runningSince: Date.now(),
                hintsShown: 0,
              })
            }}
          />
        )}
      </div>
    </aside>
  )
}

// Saves the exercise for a fresh board id, then opens that board.
function startOnBlankBoard(id: string) {
  const newBoard = `${id}-${Math.random().toString(36).slice(2, 8)}`
  saveProgress(newBoard, {
    exerciseId: id,
    elapsedMs: 0,
    runningSince: Date.now(),
    hintsShown: 0,
  })
  const url = new URL(window.location.href)
  url.search = new URLSearchParams({ board: newBoard }).toString()
  window.location.assign(url)
}

function ExerciseList({ onStart }: { onStart: (id: string) => void }) {
  const { elements } = useScene()
  const { access } = useBoard()
  const [choosing, setChoosing] = useState<string | null>(null)
  const boardEmpty = drawableElements(elements).length === 0

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted">
        Pick a system to design. A checklist grades your diagram as you draw.
      </p>
      {EXERCISES.map((exercise) => (
        <section
          key={exercise.id}
          aria-labelledby={`exercise-${exercise.id}`}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3"
        >
          <h3 id={`exercise-${exercise.id}`} className="font-bold">
            {exercise.title}
          </h3>
          <p className="text-label text-ink-muted">{exercise.prompt}</p>
          <p className="font-mono text-[11px] text-ink-muted">
            {exercise.constraints[0]}
          </p>
          {choosing === exercise.id ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  startOnBlankBoard(exercise.id)
                }}
              >
                Start on a blank board
              </button>
              <button
                type="button"
                className={outlineButton}
                onClick={() => {
                  onStart(exercise.id)
                }}
              >
                Use this board
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${outlineButton} self-start`}
              onClick={() => {
                // A board with drawings (or one you can't edit) gets the choice.
                if (boardEmpty && access === 'edit') onStart(exercise.id)
                else setChoosing(exercise.id)
              }}
            >
              Start exercise
            </button>
          )}
        </section>
      ))}
    </div>
  )
}

function ActiveExercise({
  exercise,
  progress,
  onChange,
}: {
  exercise: Exercise
  progress: Progress
  onChange: (next: Progress | null) => void
}) {
  const { elements } = useScene()
  const graph = useMemo(() => deriveGraph(elements), [elements])
  const results = exercise.rubric.map((item) => ({
    item,
    result: item.check(graph),
  }))
  const passed = results.filter(({ result }) => result.pass).length
  const running = progress.runningSince !== null

  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [running])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-bold">{exercise.title}</h3>
        <p>{exercise.prompt}</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised p-3">
        <span className="flex-1 font-mono text-lg tabular-nums" role="timer">
          {formatClock(elapsed(progress, now))}
        </span>
        <button
          type="button"
          className={outlineButton}
          onClick={() => {
            const at = Date.now()
            setNow(at)
            onChange(toggleTimer(progress, at))
          }}
        >
          <ChalklineIcon
            icon={running ? IconPlayerPause : IconPlayerPlay}
            size={16}
          />
          {running ? 'Pause' : 'Start'}
        </button>
      </div>

      <Section title="Requirements">
        <h4 className="text-label font-semibold text-ink-muted">Functional</h4>
        <List items={exercise.functional} />
        <h4 className="mt-2 text-label font-semibold text-ink-muted">
          Non-functional
        </h4>
        <List items={exercise.nonFunctional} />
      </Section>

      <Section title="Constraints">
        <ul className="flex flex-wrap gap-1.5">
          {exercise.constraints.map((constraint) => (
            <li
              key={constraint}
              className="rounded-md border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px]"
            >
              {constraint}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={`Checklist: ${passed.toString()} of ${results.length.toString()} met`}
      >
        <ul className="flex flex-col gap-2">
          {results.map(({ item, result }) => (
            <li key={item.id} className="flex gap-2">
              <ChalklineIcon
                decorative={false}
                label={result.pass ? 'Met' : 'Not met'}
                icon={result.pass ? IconCircleCheck : IconCircleX}
                size={18}
                className={`mt-0.5 shrink-0 ${result.pass ? 'text-success' : 'text-danger'}`}
              />
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-label text-ink-muted">{result.why}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Hints">
        {progress.hintsShown > 0 && (
          <ol className="mb-2 flex flex-col gap-1.5">
            {exercise.hints.slice(0, progress.hintsShown).map((hint) => (
              <li key={hint} className="flex gap-2 text-label">
                <ChalklineIcon
                  icon={IconBulb}
                  size={16}
                  className="mt-0.5 shrink-0 text-warning"
                />
                {hint}
              </li>
            ))}
          </ol>
        )}
        {progress.hintsShown < exercise.hints.length ? (
          <button
            type="button"
            className={plainButton}
            onClick={() => {
              onChange({ ...progress, hintsShown: progress.hintsShown + 1 })
            }}
          >
            Show a hint ({(progress.hintsShown + 1).toString()} of{' '}
            {exercise.hints.length.toString()})
          </button>
        ) : (
          <p className="text-label text-ink-muted">No more hints.</p>
        )}
      </Section>

      <button
        type="button"
        className={`${plainButton} self-start`}
        onClick={() => {
          onChange(null)
        }}
      >
        End exercise
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-bold">{title}</h3>
      {children}
    </section>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 text-label">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
