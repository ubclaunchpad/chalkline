import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { IconX } from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'
import { addComponentAtCenter } from './addComponent'
import { catalog, COMPONENT_DRAG_MIME, type CatalogEntry } from './catalog'

interface SidebarProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null
  onClose: () => void
}

export function Sidebar({ excalidrawAPI, onClose }: SidebarProps) {
  return (
    <aside
      id="component-sidebar"
      aria-label="Components"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="flex h-full w-56 shrink-0 flex-col border-r border-gray-200 bg-white text-gray-900"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-3">
        <h2 className="text-sm font-semibold">Components</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close components panel"
          className="inline-flex size-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>
      <div
        id="component-sidebar-list"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <ul className="flex flex-col gap-2 p-3">
          {catalog.map((entry) => (
            <li key={entry.kind}>
              <ComponentCard entry={entry} excalidrawAPI={excalidrawAPI} />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

function ComponentCard({
  entry,
  excalidrawAPI,
}: {
  entry: CatalogEntry
  excalidrawAPI: ExcalidrawImperativeAPI | null
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(COMPONENT_DRAG_MIME, entry.kind)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => {
        if (excalidrawAPI) {
          addComponentAtCenter(excalidrawAPI, entry)
        }
      }}
      aria-label={`Add ${entry.label}: ${entry.description}`}
      className="flex w-full items-start gap-2 rounded-md border border-gray-200 p-2 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 flex-none rounded-sm"
        style={{ backgroundColor: entry.color }}
      />
      <span>
        <span className="block text-sm font-medium">{entry.label}</span>
        <span className="block text-xs text-gray-500">{entry.description}</span>
      </span>
    </button>
  )
}
