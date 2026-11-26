import { layoutGraph } from '../generate/layout'
import { TEMPLATES, type Template } from './templates'

export interface TemplateGalleryProps {
  onChoose: (templateId: string) => void
}

/** Template cards with a line-drawn preview; each card is a button. */
export function TemplateGallery({ onChoose }: TemplateGalleryProps) {
  return (
    <ul
      aria-label="Templates"
      className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3"
    >
      {TEMPLATES.map((template) => (
        <li key={template.id}>
          <button
            type="button"
            onClick={() => {
              onChoose(template.id)
            }}
            className="flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left hover:border-border-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Thumbnail template={template} />
            <span className="font-semibold text-ink">{template.name}</span>
            <span className="text-label text-ink-muted">
              {template.summary}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const BOX = { w: 40, h: 22 }

function Thumbnail({ template }: { template: Template }) {
  const at = layoutGraph(
    template.components.map((c) => c.key),
    template.connections.map((c) => ({ source: c.from, target: c.to })),
    { nodeWidth: BOX.w, nodeHeight: BOX.h, gapX: 26, gapY: 12 },
  )
  const points = [...at.values()]
  const width = Math.max(160, ...points.map((p) => p.x + BOX.w / 2)) + 8
  const height = Math.max(90, ...points.map((p) => p.y + BOX.h / 2)) + 8
  return (
    <svg
      aria-hidden="true"
      viewBox={`-4 -4 ${String(width)} ${String(height)}`}
      className="aspect-video w-full rounded-md border border-border bg-canvas p-2 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      {points.length === 0 && (
        <>
          <rect
            x={width / 2 - 34}
            y={height / 2 - 22}
            width={60}
            height={36}
            rx={6}
            strokeDasharray="4 4"
          />
          <path
            d={`M${String(width / 2 - 4)} ${String(height / 2 - 10)}v12m-6 -6h12`}
          />
        </>
      )}
      {template.connections.map((c) => {
        const a = at.get(c.from)
        const b = at.get(c.to)
        if (!a || !b) return null
        return (
          <line
            key={`${c.from}-${c.to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            opacity={0.7}
            strokeDasharray={c.kind === 'async' ? '3 3' : undefined}
          />
        )
      })}
      {points.map((p, i) => (
        <rect
          key={i}
          x={p.x - BOX.w / 2}
          y={p.y - BOX.h / 2}
          width={BOX.w}
          height={BOX.h}
          rx={4}
          className="fill-canvas"
        />
      ))}
    </svg>
  )
}
