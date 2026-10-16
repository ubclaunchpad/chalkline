import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { isComponentData, type ComponentData, type Kind } from './catalog'
import {
  addMissingIcons,
  componentIdOf,
  createComponent,
  updateComponent,
} from './elements'
import { exampleElements } from './example'
import { iconFiles } from './icons'
import { deriveGraph, reviewGraph } from './graph'
import Palette, { DRAG_MIME } from './Palette'
import ShareDialog from './ShareDialog'
import SidePanel from './SidePanel'
import {
  getBoardMeta,
  loadElements,
  saveBoardMeta,
  saveElements,
} from './storage'
import { TEAMMATES, teammateFrame } from './teammates'

type SyncMode = 'saved' | 'saving' | 'offline' | 'reconnecting'

const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    export: false,
    saveToActiveFile: false,
    toggleTheme: null,
  },
  tools: { image: false },
} as const

export default function Board({
  boardId,
  viewOnly,
}: {
  boardId: string
  viewOnly: boolean
}) {
  const [meta, setMeta] = useState(() => {
    const existing = getBoardMeta(boardId)
    if (existing || viewOnly) return existing
    const created = {
      id: boardId,
      name: 'Untitled board',
      updatedAt: Date.now(),
    }
    saveBoardMeta(created)
    return created
  })
  const [initialData] = useState(() => {
    const elements = addMissingIcons(loadElements(boardId))
    return {
      elements,
      appState: { viewBackgroundColor: '#ffffff' },
      files: iconFiles(),
      scrollToContent: elements.length > 0,
    }
  })
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [elements, setElements] = useState<readonly ExcalidrawElement[]>(
    initialData.elements,
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tab, setTab] = useState<'properties' | 'review'>('properties')
  const [sync, setSync] = useState<{ mode: SyncMode; pending: number }>({
    mode: 'saved',
    pending: 0,
  })
  const [teammatesOn, setTeammatesOn] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)

  const lastVersion = useRef(getSceneVersion(initialData.elements))
  const selectionKey = useRef('')
  // Selections made from the side panel shouldn't yank the user to another tab.
  const keepTab = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const syncRef = useRef(sync)
  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  const persist = useCallback(() => {
    if (api) saveElements(boardId, api.getSceneElementsIncludingDeleted())
  }, [api, boardId])

  const onChange = useCallback(
    (els: readonly ExcalidrawElement[], appState: AppState) => {
      const version = getSceneVersion(els)
      if (version !== lastVersion.current) {
        lastVersion.current = version
        setElements(els)
        if (!viewOnly) {
          if (syncRef.current.mode === 'offline') {
            // Offline edits stay on this device until "reconnecting".
            saveElements(boardId, els)
            setSync((s) => ({ ...s, pending: s.pending + 1 }))
          } else {
            setSync({ mode: 'saving', pending: 0 })
            window.clearTimeout(saveTimer.current)
            saveTimer.current = window.setTimeout(() => {
              saveElements(boardId, els)
              setSync({ mode: 'saved', pending: 0 })
            }, 600)
          }
        }
      }
      const ids = Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      )
      const key = ids.sort().join(',')
      if (key !== selectionKey.current) {
        selectionKey.current = key
        setSelectedIds(ids)
        // Selecting one component jumps to its properties.
        if (selectedComponentId(ids, els) && !keepTab.current) {
          setTab('properties')
        }
        keepTab.current = false
      }
    },
    [boardId, viewOnly],
  )

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  // Fit the whole design in view when a board opens.
  useEffect(() => {
    if (!api || initialData.elements.length === 0) return
    // Wait for Excalidraw to finish loading initialData before fitting.
    const timer = window.setTimeout(() => {
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
      })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [api, initialData])

  // Simulated teammates: animate their cursors while "online".
  useEffect(() => {
    if (!api) return
    if (
      !teammatesOn ||
      sync.mode === 'offline' ||
      sync.mode === 'reconnecting'
    ) {
      api.updateScene({ collaborators: new Map() })
      return
    }
    const timer = window.setInterval(() => {
      api.updateScene({
        collaborators: teammateFrame(performance.now(), api.getSceneElements()),
      })
    }, 80)
    return () => window.clearInterval(timer)
  }, [api, teammatesOn, sync.mode])

  const graph = useMemo(() => deriveGraph(elements), [elements])
  const findings = useMemo(() => reviewGraph(graph), [graph])

  const selected = useMemo(() => {
    const id = selectedComponentId(selectedIds, elements)
    const el = id && elements.find((e) => e.id === id)
    return el && isComponentData(el.customData)
      ? { id: el.id, data: el.customData }
      : null
  }, [elements, selectedIds])

  const insert = useCallback(
    (kind: Kind, client?: { clientX: number; clientY: number }) => {
      if (!api) return
      const appState = api.getAppState()
      const point = viewportCoordsToSceneCoords(
        client ?? {
          clientX: appState.offsetLeft + appState.width / 2,
          clientY: appState.offsetTop + appState.height / 2,
        },
        appState,
      )
      const scene = api.getSceneElementsIncludingDeleted()
      const { id, created } = createComponent(kind, point, scene, !client)
      const next = [...scene, ...created]
      api.updateScene({
        elements: next,
        appState: selectionFor([id], next),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
      api.setActiveTool({ type: 'selection' })
    },
    [api],
  )

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const kind = e.dataTransfer.getData(DRAG_MIME) as Kind
    if (!kind) return
    e.preventDefault()
    e.stopPropagation()
    insert(kind, { clientX: e.clientX, clientY: e.clientY })
  }

  const changeComponent = useCallback(
    (id: string, data: ComponentData) => {
      if (!api) return
      api.updateScene({
        elements: updateComponent(
          api.getSceneElementsIncludingDeleted(),
          id,
          data,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
    },
    [api],
  )

  const focus = useCallback(
    (ids: string[]) => {
      if (!api) return
      const targets = api.getSceneElements().filter((e) => ids.includes(e.id))
      keepTab.current = true
      api.updateScene({
        appState: selectionFor(ids, api.getSceneElements()),
      })
      if (targets.length) api.scrollToContent(targets, { animate: true })
    },
    [api],
  )

  const loadExample = () => {
    if (!api) return
    const example = exampleElements()
    api.updateScene({
      elements: example,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    api.scrollToContent(example, {
      fitToViewport: true,
      viewportZoomFactor: 0.8,
    })
  }

  const toggleOffline = () => {
    if (sync.mode === 'offline') {
      setSync((s) => ({ ...s, mode: 'reconnecting' }))
      window.setTimeout(() => {
        persist()
        setSync({ mode: 'saved', pending: 0 })
      }, 1200)
    } else {
      setSync({ mode: 'offline', pending: 0 })
    }
  }

  if (!meta && initialData.elements.length === 0 && viewOnly) {
    return <NotFound />
  }

  const name = meta?.name ?? 'Untitled board'
  const isEmpty = graph.nodes.length === 0 && elements.every((e) => e.isDeleted)

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-3">
        <a
          href="#/"
          className="rounded px-2 py-1 font-semibold hover:bg-slate-100"
          title="All boards"
        >
          Chalkline
        </a>
        <span className="text-slate-300">/</span>
        {viewOnly ? (
          <span className="font-medium">{name}</span>
        ) : (
          <input
            aria-label="Board name"
            defaultValue={name}
            onBlur={(e) => {
              const next = {
                id: boardId,
                name: e.target.value.trim() || 'Untitled board',
                updatedAt: Date.now(),
              }
              saveBoardMeta(next)
              setMeta(next)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-56 rounded px-2 py-1 font-medium outline-none hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-400"
          />
        )}
        {viewOnly && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            View only
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {!viewOnly && (
            <SyncPill
              mode={sync.mode}
              pending={sync.pending}
              onClick={toggleOffline}
            />
          )}
          <Avatars teammatesOn={teammatesOn && sync.mode !== 'offline'} />
          <label
            className="flex items-center gap-1.5 text-xs text-slate-500"
            title="Prototype only"
          >
            <input
              type="checkbox"
              checked={teammatesOn}
              onChange={(e) => setTeammatesOn(e.target.checked)}
            />
            Simulate teammates
          </label>
          {!viewOnly && (
            <button
              onClick={() => setShareOpen(true)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Share
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {!viewOnly && <Palette onAdd={(kind) => insert(kind)} />}
        <div
          className="relative min-w-0 flex-1"
          onDragOverCapture={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDropCapture={onDrop}
        >
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={onChange}
            viewModeEnabled={viewOnly}
            UIOptions={UI_OPTIONS}
            name={name}
          />
          {isEmpty && !viewOnly && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto max-w-sm rounded-xl border border-slate-200 bg-white/95 p-5 text-center shadow-sm">
                <p className="font-medium">Start your design</p>
                <p className="mt-1 text-sm text-slate-500">
                  Drag a component from the left, then connect components with
                  arrows.
                </p>
                <button
                  onClick={loadExample}
                  className="mt-3 text-sm font-medium text-slate-900 underline"
                >
                  Or load an example
                </button>
              </div>
            </div>
          )}
          {sync.mode === 'offline' && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
              You're offline. Edits are kept on this device and will sync when
              you reconnect.
            </div>
          )}
        </div>
        <SidePanel
          tab={tab}
          onTab={setTab}
          selected={selected}
          graph={graph}
          findings={findings}
          readOnly={viewOnly}
          onChange={changeComponent}
          onFocus={focus}
        />
      </div>

      {shareOpen && (
        <ShareDialog boardId={boardId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}

function SyncPill({
  mode,
  pending,
  onClick,
}: {
  mode: SyncMode
  pending: number
  onClick: () => void
}) {
  const styles: Record<SyncMode, { dot: string; text: string }> = {
    saved: { dot: 'bg-emerald-500', text: 'Saved' },
    saving: { dot: 'bg-sky-500 animate-pulse', text: 'Saving…' },
    reconnecting: { dot: 'bg-amber-500 animate-pulse', text: 'Reconnecting…' },
    offline: {
      dot: 'bg-slate-400',
      text: pending
        ? `Offline · ${pending} unsynced change${pending > 1 ? 's' : ''}`
        : 'Offline',
    },
  }
  const s = styles[mode]
  return (
    <button
      onClick={onClick}
      title={
        mode === 'offline'
          ? 'Simulate reconnecting'
          : 'Simulate going offline (prototype)'
      }
      className="flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.text}
    </button>
  )
}

function Avatars({ teammatesOn }: { teammatesOn: boolean }) {
  const people = [
    {
      id: 'me',
      initials: 'You',
      background: '#e9ecef',
      stroke: '#343a40',
      name: 'You',
    },
    ...(teammatesOn ? TEAMMATES : []),
  ]
  return (
    <div
      className="flex -space-x-1.5"
      aria-label={`${people.length} people on this board`}
    >
      {people.map((p) => (
        <span
          key={p.id}
          title={p.name}
          className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white px-1 text-[11px] font-semibold"
          style={{ background: p.background, color: p.stroke }}
        >
          {p.initials}
        </span>
      ))}
    </div>
  )
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Board not found</h1>
        <p className="mt-2 text-slate-500">
          This link may be wrong, or the board was deleted.
        </p>
        <a href="#/" className="mt-4 inline-block font-medium underline">
          Back to your boards
        </a>
      </div>
    </main>
  )
}

/** The single component a selection covers (its box, label, and icon), if any. */
function selectedComponentId(
  ids: string[],
  elements: readonly ExcalidrawElement[],
): string | undefined {
  if (ids.length === 0) return undefined
  const byId = new Map(elements.map((e) => [e.id, e]))
  const owners = new Set(
    ids.map((id) => {
      const el = byId.get(id)
      return el ? componentIdOf(el, byId) : undefined
    }),
  )
  const [only] = owners
  return owners.size === 1 ? only : undefined
}

/** Selection state for elements, selecting whole component groups. */
function selectionFor(ids: string[], elements: readonly ExcalidrawElement[]) {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const groups = new Set(
    ids.flatMap((id) => {
      const el = byId.get(id)
      return el && isComponentData(el.customData) ? el.groupIds : []
    }),
  )
  const selected = elements.filter(
    (e) =>
      !e.isDeleted &&
      (ids.includes(e.id) || e.groupIds.some((g) => groups.has(g))),
  )
  return {
    selectedElementIds: Object.fromEntries(
      selected.map((e) => [e.id, true as const]),
    ),
    selectedGroupIds: Object.fromEntries(
      [...groups].map((g) => [g, true as const]),
    ),
  }
}
