import { useEffect, useMemo, useState } from 'react'
import {
  IconLayoutDistributeVertical,
  IconWand,
  IconX,
} from '@tabler/icons-react'
import { useBoard, useScene } from '../app/context'
import { CATALOG } from '../catalog/catalog'
import { ChalklineIcon } from '../design/Icon'
import { applySuggestion, insertDraft, tidyBoard } from '../generate/board'
import { deriveGraph } from '../graph/deriveGraph'
import { useBoardConnection } from '../realtime/useBoardConnection'
import { applyTemplate } from '../templates/applyTemplate'
import { localProvider } from './provider'

const provider = localProvider

const EXAMPLE =
  'A mobile app talks to an API gateway, which calls an orders service and a users service. Orders writes to Postgres and publishes events to Kafka; an email worker consumes them.'

const outlineButton =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-3 text-label font-semibold text-ink hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton =
  'inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-label font-bold text-on-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Applies `?template=<id>` once, when this tab is the first one on the board
 * and the board is still empty after the server's snapshot.
 */
function useTemplateFromUrl() {
  const { api, access } = useBoard()
  const connection = useBoardConnection()
  // How many people were on the board when we joined; null until we know.
  const [joinedWith, setJoinedWith] = useState<number | null>(null)

  useEffect(() => {
    if (!connection) return
    // The server sends the snapshot before the first participants list.
    const off = connection.on('participants', (message) => {
      setJoinedWith((seen) => seen ?? message.clientIds.length)
    })
    return off
  }, [connection])

  useEffect(() => {
    if (!api || joinedWith === null) return
    const url = new URL(window.location.href)
    const templateId = url.searchParams.get('template')
    if (!templateId) return
    // Removing the param first also stops StrictMode's second run.
    url.searchParams.delete('template')
    window.history.replaceState(window.history.state, '', url)
    const empty = api
      .getSceneElements()
      .every(
        (e) =>
          (e.customData as { annotation?: string } | undefined)?.annotation ===
          'board',
      )
    if (empty && joinedWith === 1 && access === 'edit') {
      applyTemplate(api, templateId)
    }
  }, [api, joinedWith, access])
}

export function AssistantButton() {
  const { panel, togglePanel } = useBoard()
  useTemplateFromUrl()
  return (
    <button
      type="button"
      aria-pressed={panel === 'assistant'}
      onClick={() => {
        togglePanel('assistant')
      }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-label font-semibold text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring aria-pressed:bg-surface-selected aria-pressed:text-ink"
    >
      <ChalklineIcon icon={IconWand} size={18} />
      <span className="max-sm:sr-only">Assistant</span>
    </button>
  )
}

export function AssistantPanel() {
  const { panel, closePanel } = useBoard()
  if (panel !== 'assistant') return null
  return (
    <aside
      aria-labelledby="assistant-heading"
      onKeyDown={(event) => {
        if (event.key === 'Escape') closePanel()
      }}
      className="flex h-full w-80 flex-col border-l border-border bg-surface text-ink max-md:w-full"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <h2 id="assistant-heading" className="font-bold">
          Assistant{' '}
          <span className="font-normal text-ink-muted">(runs locally)</span>
        </h2>
        <button
          type="button"
          aria-label="Close assistant"
          onClick={closePanel}
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        <p className="text-label text-ink-muted">
          Everything here uses fixed rules in your browser. Nothing about your
          board is sent anywhere.
        </p>
        <DraftSection />
        <BoardSections />
      </div>
    </aside>
  )
}

function DraftSection() {
  const { api, access } = useBoard()
  const [text, setText] = useState('')
  const draft = useMemo(() => provider.draft(text), [text])
  const name = (key: string) =>
    draft.components.find((c) => c.key === key)?.name ?? key
  const canEdit = access === 'edit' && api !== null

  return (
    <section aria-labelledby="draft-heading" className="flex flex-col gap-2">
      <h3 id="draft-heading" className="font-bold">
        Draft from a description
      </h3>
      <label
        htmlFor="assistant-description"
        className="text-label text-ink-muted"
      >
        Name the parts of your system and how they talk to each other.
      </label>
      <textarea
        id="assistant-description"
        rows={5}
        value={text}
        placeholder={`Describe your system… e.g. ${EXAMPLE}`}
        onChange={(event) => {
          setText(event.target.value)
        }}
        className="resize-y rounded-md border border-border bg-canvas p-2 text-body text-ink placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-focus-ring"
      />
      {text.trim() !== '' && (
        <div
          aria-live="polite"
          className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3"
        >
          {draft.components.length === 0 ? (
            <p className="text-label text-ink-muted">
              No components found yet. Try words like “API gateway”, “Postgres”,
              “Redis cache” or “calls”.
            </p>
          ) : (
            <>
              <p className="text-label font-semibold">
                {draft.components.length} components, {draft.connections.length}{' '}
                connections
              </p>
              <ul className="flex flex-col gap-0.5 text-label">
                {draft.components.map((c) => (
                  <li key={c.key}>
                    {c.name}{' '}
                    <span className="text-ink-muted">
                      · {CATALOG[c.kind].label}
                    </span>
                  </li>
                ))}
              </ul>
              {draft.connections.length > 0 && (
                <ul className="flex flex-col gap-0.5 font-mono text-[0.75rem] text-ink-muted">
                  {draft.connections.map((c) => (
                    <li key={`${c.from}-${c.to}`}>
                      {name(c.from)} → {name(c.to)}
                      {c.kind === 'async' ? ' (async)' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      <div>
        <button
          type="button"
          disabled={!canEdit || draft.components.length === 0}
          onClick={() => {
            if (!api) return
            insertDraft(api, draft)
            setText('')
          }}
          className={primaryButton}
        >
          Add to board
        </button>
      </div>
    </section>
  )
}

function BoardSections() {
  const { api, access } = useBoard()
  const { elements } = useScene()
  const graph = useMemo(() => deriveGraph(elements), [elements])
  const explanation = useMemo(() => provider.explain(graph), [graph])
  const suggestions = useMemo(() => provider.suggest(graph), [graph])
  const canEdit = access === 'edit' && api !== null
  const hasComponents = Object.keys(graph.nodes).length > 0

  return (
    <>
      <section aria-labelledby="tidy-heading" className="flex flex-col gap-2">
        <h3 id="tidy-heading" className="font-bold">
          Tidy up
        </h3>
        <p className="text-label text-ink-muted">
          Lays components out left to right in the order requests flow.
        </p>
        <div>
          <button
            type="button"
            disabled={!canEdit || !hasComponents}
            onClick={() => {
              if (api) tidyBoard(api)
            }}
            className={outlineButton}
          >
            <ChalklineIcon icon={IconLayoutDistributeVertical} size={16} />
            Tidy up
          </button>
        </div>
      </section>

      <section
        aria-labelledby="explain-heading"
        className="flex flex-col gap-2"
      >
        <h3 id="explain-heading" className="font-bold">
          Explain this diagram
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-label">
          {explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {hasComponents && (
        <section aria-labelledby="next-heading" className="flex flex-col gap-2">
          <h3 id="next-heading" className="font-bold">
            Suggested next steps
          </h3>
          {suggestions.length === 0 ? (
            <p className="text-label text-ink-muted">
              Nothing obvious to add. Try Checks or Review for a closer look.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-raised p-3 text-label"
                >
                  {suggestion.text}
                  {suggestion.add && (
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-label={`Add it: ${suggestion.add.name}`}
                      onClick={() => {
                        if (api && suggestion.add)
                          applySuggestion(api, suggestion.add)
                      }}
                      className={outlineButton}
                    >
                      Add it
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {access === 'view' && (
        <p className="text-label text-ink-muted">
          You can view this board but not change it, so adding is turned off.
        </p>
      )}
    </>
  )
}
