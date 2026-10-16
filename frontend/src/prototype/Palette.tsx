import { CATALOG, type Kind } from './catalog'
import ComponentIcon from './ComponentIcon'

export const DRAG_MIME = 'application/x-chalkline-kind'

export default function Palette({ onAdd }: { onAdd: (kind: Kind) => void }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Components</h2>
        <p className="mt-1 text-xs text-slate-500">
          Drag onto the canvas or click to add.
        </p>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-2">
        {CATALOG.map((def) => (
          <li key={def.kind}>
            <button
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, def.kind)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onAdd(def.kind)}
              className="flex w-full cursor-grab items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100 active:cursor-grabbing"
              title={def.description}
            >
              <ComponentIcon kind={def.kind} size="sm" />
              <span>
                <span className="block text-sm font-medium">{def.label}</span>
                <span className="block text-xs leading-snug text-slate-500">
                  {def.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
        Connect components with the arrow tool (
        <kbd className="rounded bg-slate-100 px-1">A</kbd>), dragging from one
        box to another.
      </div>
    </aside>
  )
}
