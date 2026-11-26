import { useEffect, useRef, useState } from 'react'
import { IconComponents, IconTemplate, IconX } from '@tabler/icons-react'
import { useBoard, useScene } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { isOnCanvas } from '../layout/boardInfo'
import { applyTemplate } from '../templates/applyTemplate'
import { TemplateGallery } from '../templates/TemplateGallery'
import { openComponentsPanel } from './componentsPanel'
import { TOOL_BUTTON } from './styles'

const SECONDARY_BUTTON =
  'pointer-events-auto inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-body font-semibold text-ink transition-colors hover:border-accent hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

/** Handwritten hint and starting points while the board is empty. */
export function EmptyState() {
  const { api, access } = useBoard()
  const { elements } = useScene()
  const [browsing, setBrowsing] = useState(false)
  const empty = !elements.some(isOnCanvas)

  if (!api || access === 'view') return null

  return (
    <>
      {empty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="flex items-start gap-3">
            <ChalkArrow />
            <div className="flex flex-col items-start gap-4 pt-6">
              <p className="max-w-64 font-handwriting text-[1.75rem] leading-8 font-bold text-ink-muted">
                start by dragging a component onto the board
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBrowsing(true)
                  }}
                  className={SECONDARY_BUTTON}
                >
                  <ChalklineIcon icon={IconTemplate} size={18} />
                  Browse templates
                </button>
                <button
                  type="button"
                  onClick={openComponentsPanel}
                  className={SECONDARY_BUTTON}
                >
                  <ChalklineIcon icon={IconComponents} size={18} />
                  Add component
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {browsing && (
        <TemplatesDialog
          onChoose={(templateId) => {
            applyTemplate(api, templateId)
            setBrowsing(false)
          }}
          onClose={() => {
            setBrowsing(false)
          }}
        />
      )}
    </>
  )
}

function TemplatesDialog({
  onChoose,
  onClose,
}: {
  onChoose: (templateId: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    // Native modal dialog: traps focus, closes on Escape, restores focus.
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby="templates-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) ref.current?.close()
      }}
      className="m-auto max-h-[80dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex max-h-[80dvh] flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="templates-dialog-title" className="text-base font-bold">
            Browse templates
          </h2>
          <button
            type="button"
            aria-label="Close templates"
            onClick={() => ref.current?.close()}
            className={TOOL_BUTTON.replace('size-10', 'size-8')}
          >
            <ChalklineIcon icon={IconX} size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">
          <TemplateGallery onChoose={onChoose} />
        </div>
      </div>
    </dialog>
  )
}

/** A hand-drawn arrow curling left, toward the toolbar and components. */
function ChalkArrow() {
  return (
    <svg
      aria-hidden="true"
      width="120"
      height="80"
      viewBox="0 0 120 80"
      fill="none"
      className="shrink-0 text-ink-muted/70"
    >
      <g
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M116 30c-18-14-46-20-70-12C30 23 18 33 9 47" />
        <path d="M114 33c-20-12-44-17-66-10" opacity="0.45" />
        <path d="M5 30c1 6 2 12 4 18 6-2 12-3 19-3" />
      </g>
    </svg>
  )
}
