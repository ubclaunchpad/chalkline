import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { IconSearch, IconX } from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'
import { useOpenComponentsRequest } from '../shell/componentsPanel'
import { addComponentAtCenter } from './addComponent'
import { catalog, COMPONENT_DRAG_MIME, type CatalogEntry } from './catalog'

interface SidebarProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null
  onClose: () => void
}

/** Catalog entries matching a search, grouped in catalog order. */
function groupEntries(
  entries: readonly CatalogEntry[],
  query: string,
): [CatalogEntry['group'], CatalogEntry[]][] {
  const needle = query.trim().toLowerCase()
  const groups = new Map<CatalogEntry['group'], CatalogEntry[]>()
  for (const entry of entries) {
    const haystack =
      `${entry.label} ${entry.description} ${entry.kind} ${entry.group}`.toLowerCase()
    if (needle && !haystack.includes(needle)) continue
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry])
  }
  return [...groups]
}

export function Sidebar({ excalidrawAPI, onClose }: SidebarProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const searchId = useId()
  const groups = useMemo(() => groupEntries(catalog, query), [query])

  // Opened from the toolbar or empty state: put the cursor in the search box
  // once the panel is visible.
  useOpenComponentsRequest(
    useCallback(() => {
      requestAnimationFrame(() => searchRef.current?.focus())
    }, []),
  )

  return (
    <aside
      id="component-sidebar"
      aria-label="Components"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="flex h-full w-72 flex-col overflow-hidden rounded-xl border border-border bg-surface text-ink shadow-xl shadow-black/40"
    >
      <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-body font-bold">Components</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close components panel"
          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>
      <div className="shrink-0 px-3 pb-2">
        <label htmlFor={searchId} className="sr-only">
          Search components
        </label>
        <div className="relative">
          <ChalklineIcon
            icon={IconSearch}
            size={16}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
            placeholder="Search components"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-border bg-bg pr-2 pl-8 text-body text-ink placeholder:text-ink-muted/80 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring/40"
          />
        </div>
      </div>
      <div
        id="component-sidebar-list"
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      >
        {groups.length === 0 ? (
          <p className="px-1 py-6 text-center text-body text-ink-muted">
            No components match “{query.trim()}”
          </p>
        ) : (
          groups.map(([group, entries]) => (
            <section key={group} aria-label={group} className="pt-2">
              <h3 className="px-1 pb-1.5 text-[0.6875rem] font-bold tracking-wide text-ink-muted uppercase">
                {group}
              </h3>
              <ul className="grid grid-cols-3 gap-1.5">
                {entries.map((entry) => (
                  <li key={entry.kind}>
                    <ComponentTile
                      entry={entry}
                      excalidrawAPI={excalidrawAPI}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}

function ComponentTile({
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
      title={entry.description}
      className="flex h-20 w-full cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised px-1 text-center text-ink transition-colors hover:border-accent/60 hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring active:cursor-grabbing"
    >
      <ChalklineIcon icon={entry.icon} size={22} className="text-accent" />
      <span className="line-clamp-2 text-[0.75rem] leading-tight font-semibold">
        {entry.label}
      </span>
    </button>
  )
}
