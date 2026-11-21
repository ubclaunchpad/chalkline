import { useState } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'
import { addComponentAtCenter } from './addComponent'
import { catalog, COMPONENT_DRAG_MIME, type CatalogEntry } from './catalog'

interface SidebarProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null
}

const LIST_ID = 'component-sidebar-list'

export function Sidebar({ excalidrawAPI }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-full shrink-0">
      <div
        id={LIST_ID}
        hidden={collapsed}
        className="h-full w-56 overflow-y-auto border-r border-gray-200 bg-white text-gray-900"
      >
        <ul className="flex flex-col gap-2 p-3">
          {catalog.map((entry) => (
            <li key={entry.kind}>
              <ComponentCard entry={entry} excalidrawAPI={excalidrawAPI} />
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => {
          setCollapsed((value) => !value)
        }}
        aria-expanded={!collapsed}
        aria-controls={LIST_ID}
        aria-label={collapsed ? 'Show component list' : 'Hide component list'}
        className="inline-flex h-8 w-6 items-center justify-center self-start rounded-r-md border border-gray-200 bg-white text-xs leading-none text-gray-600 hover:bg-gray-50"
      >
        <ChalklineIcon
          icon={collapsed ? IconChevronRight : IconChevronLeft}
          size={16}
        />
      </button>
    </div>
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
