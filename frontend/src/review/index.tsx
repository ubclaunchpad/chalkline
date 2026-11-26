import { useMemo } from 'react'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconStethoscope,
} from '@tabler/icons-react'
import { useBoard } from '../app/context'
import { focusElements, useSettledGraph } from '../checks/shared'
import { SidePanel, topBarButtonClass } from '../checks/SidePanel'
import { ChalklineIcon } from '../design/Icon'
import { AREAS, reviewDiagram, type Score } from './rules'

const AREA_LABEL = {
  reliability: 'Reliability',
  scalability: 'Scalability',
  security: 'Security',
} as const

const SCORE_LOOK: Record<
  Score,
  { icon: typeof IconCircleCheck; text: string }
> = {
  Good: { icon: IconCircleCheck, text: 'text-success' },
  Fair: { icon: IconAlertTriangle, text: 'text-warning' },
  'Needs work': { icon: IconCircleX, text: 'text-danger' },
}

export function ReviewButton() {
  const { panel, togglePanel } = useBoard()
  return (
    <button
      type="button"
      aria-pressed={panel === 'review'}
      onClick={() => {
        togglePanel('review')
      }}
      className={topBarButtonClass}
    >
      <ChalklineIcon icon={IconStethoscope} size={18} />
      <span className="max-sm:sr-only">Review</span>
    </button>
  )
}

export function ReviewPanel() {
  const { panel } = useBoard()
  return panel === 'review' ? <ReviewContent /> : null
}

function ReviewContent() {
  const { api, closePanel } = useBoard()
  const { graph } = useSettledGraph()
  const review = useMemo(() => reviewDiagram(graph), [graph])
  const empty = Object.keys(graph.nodes).length === 0

  return (
    <SidePanel title="Review (runs locally)" onClose={closePanel}>
      <p className="mb-3 text-label text-ink-muted">
        Built-in rules read your diagram in this browser. Nothing is sent
        anywhere.
      </p>
      {empty ? (
        <p className="text-ink-muted">
          Add a few components and connect them to get a review.
        </p>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-3 gap-2">
            {AREAS.map((area) => {
              const score = review.scores[area]
              const look = SCORE_LOOK[score]
              return (
                <div
                  key={area}
                  className="rounded-lg border border-border bg-surface-raised p-2"
                >
                  <dt className="text-label text-ink-muted">
                    {AREA_LABEL[area]}
                  </dt>
                  <dd
                    className={`mt-1 flex items-center gap-1 text-label font-bold ${look.text}`}
                  >
                    <ChalklineIcon icon={look.icon} size={16} />
                    {score}
                  </dd>
                </div>
              )
            })}
          </dl>
          {review.findings.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-success">
              <ChalklineIcon icon={IconCircleCheck} size={20} />
              No weak spots found by the built-in rules.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Findings">
              {review.findings.map((finding) => (
                <li
                  key={finding.key}
                  className="rounded-lg border border-border bg-surface-raised p-3"
                >
                  <button
                    type="button"
                    disabled={finding.elementIds.length === 0}
                    onClick={() => {
                      focusElements(api, finding.elementIds)
                    }}
                    className="flex w-full items-start gap-2 rounded-md text-left font-semibold enabled:hover:text-accent focus-visible:outline-2 focus-visible:outline-focus-ring"
                  >
                    <ChalklineIcon
                      icon={finding.high ? IconCircleX : IconAlertTriangle}
                      size={18}
                      decorative={false}
                      label={finding.high ? 'Important' : 'Worth a look'}
                      className={`mt-px shrink-0 ${finding.high ? 'text-danger' : 'text-warning'}`}
                    />
                    <span>
                      {finding.title}
                      <span className="block text-label font-normal text-ink-muted">
                        {AREA_LABEL[finding.area]}
                      </span>
                    </span>
                  </button>
                  <p className="mt-2 text-label">
                    <span className="font-bold">Why it matters: </span>
                    {finding.why}
                  </p>
                  <p className="mt-1 text-label">
                    <span className="font-bold">What to try: </span>
                    {finding.tryThis}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SidePanel>
  )
}
