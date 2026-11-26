import { useEffect, useId, useRef, useState } from 'react'
import {
  IconCheck,
  IconCornerDownLeft,
  IconRefresh,
  IconX,
} from '@tabler/icons-react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { useBoard } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import {
  addReply,
  cornerOf,
  createThread,
  initials,
  MAX_TEXT,
  newMessage,
  pinPoint,
  readComment,
  setResolved,
  targetAt,
  type Thread,
} from './comments'
import { commentUi, useCommentUi, type Draft } from './commentUi'
import {
  author,
  plainButtonClass,
  primaryButtonClass,
  toBoard,
  useThreads,
  useViewport,
  writeElements,
} from './shared'

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Comment pins over the canvas, the placing layer, and the open thread card. */
export function CommentPins() {
  const { api } = useBoard()
  const view = useViewport()
  const { elements, threads, byId } = useThreads()
  const ui = useCommentUi()

  useEffect(() => {
    if (!ui.placing && !ui.draft && !ui.openId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') commentUi.close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [ui.placing, ui.draft, ui.openId])

  if (!api || !view) return null

  const open = threads.find((thread) => thread.id === ui.openId)
  const shown = threads.filter(
    (thread) => !thread.data.resolved || thread.id === ui.openId,
  )
  const cardAt = open
    ? pinPoint(open, byId)
    : ui.draft
      ? draftPoint(ui.draft, byId)
      : null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {ui.placing && (
        <div
          role="presentation"
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onPointerDown={(event) => {
            // Keep Excalidraw from starting a selection under the layer.
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const zoom = view.zoom.value
            const x = (event.clientX - box.left) / zoom - view.scrollX
            const y = (event.clientY - box.top) / zoom - view.scrollY
            const target = targetAt(elements, x, y)
            commentUi.startDraft({ x, y, targetId: target?.id })
          }}
        />
      )}

      {shown.map((thread) => {
        const { left, top } = toBoard(pinPoint(thread, byId), view)
        const first = thread.data.messages[0]
        const count = thread.data.messages.length
        return (
          <button
            key={thread.id}
            type="button"
            aria-label={`Comment by ${first.author}, ${String(count)} ${count === 1 ? 'message' : 'messages'}: ${first.text}`}
            aria-expanded={thread.id === ui.openId}
            onClick={() => {
              if (thread.id === ui.openId) commentUi.close()
              else commentUi.open(thread.id)
            }}
            className="pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full rounded-bl-none border-2 border-canvas text-[11px] font-extrabold text-canvas shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            style={{
              left,
              top,
              backgroundColor: first.color,
              opacity: thread.data.resolved ? 0.6 : 1,
            }}
          >
            <span aria-hidden="true">{initials(first.author)}</span>
            {count > 1 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-surface-raised text-[10px] text-ink"
              >
                {count}
              </span>
            )}
          </button>
        )
      })}

      {ui.draft && cardAt && (
        <div
          aria-hidden="true"
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-4 ring-accent/30"
          style={toBoard(cardAt, view)}
        />
      )}

      {cardAt && (open ?? ui.draft) && (
        <ThreadCard
          key={open?.id ?? 'draft'}
          thread={open}
          draft={ui.draft}
          position={toBoard(cardAt, view)}
          boardWidth={api.getAppState().width}
        />
      )}
    </div>
  )
}

function draftPoint(
  draft: Draft,
  byId: ReadonlyMap<string, ExcalidrawElement>,
) {
  // A draft on a component shows at its corner, like the pin it becomes.
  const target = draft.targetId ? byId.get(draft.targetId) : undefined
  return target ? cornerOf(target) : { x: draft.x, y: draft.y }
}

const CARD_WIDTH = 288

function ThreadCard({
  thread,
  draft,
  position,
  boardWidth,
}: {
  thread: Thread | undefined
  draft: Draft | null
  position: { left: number; top: number }
  boardWidth: number
}) {
  const { api, access } = useBoard()
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()
  const canEdit = access === 'edit'

  useEffect(() => {
    input.current?.focus()
  }, [])

  if (!api) return null

  // Re-read the thread at write time so a reply builds on the newest version.
  const latest = (): Thread | undefined => {
    if (!thread) return undefined
    const element = api
      .getSceneElementsIncludingDeleted()
      .find((candidate) => candidate.id === thread.id)
    const data = element && readComment(element)
    return element && data ? { id: element.id, element, data } : undefined
  }

  const post = () => {
    if (!text.trim()) return
    const message = newMessage(author(), text)
    const current = latest()
    if (current) {
      writeElements(api, [addReply(current, message)])
    } else if (draft) {
      const created = createThread(draft, draft.targetId, message)
      writeElements(api, [created])
      commentUi.open(created.id)
    }
    setText('')
  }

  const toggleResolved = () => {
    const current = latest()
    if (!current) return
    writeElements(api, [setResolved(current, !current.data.resolved)])
    if (!current.data.resolved) commentUi.close()
  }

  // Keep the card inside the board: flip left when it would run off the edge.
  const left =
    position.left + 20 + CARD_WIDTH > boardWidth
      ? Math.max(8, position.left - 20 - CARD_WIDTH)
      : position.left + 20
  const top = Math.max(8, position.top - 16)
  const messages = thread?.data.messages ?? []

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      className="pointer-events-auto absolute flex max-h-[min(28rem,70%)] flex-col rounded-xl border border-border bg-surface-raised text-ink shadow-xl"
      style={{ left, top, width: CARD_WIDTH }}
    >
      <header className="flex items-center gap-2 border-b border-border py-1.5 pr-1.5 pl-3">
        <h2 id={titleId} className="flex-1 text-label font-bold">
          {thread
            ? thread.data.resolved
              ? 'Resolved comment'
              : 'Comment'
            : 'New comment'}
        </h2>
        {thread && canEdit && (
          <button
            type="button"
            onClick={toggleResolved}
            className={plainButtonClass}
          >
            <ChalklineIcon
              icon={thread.data.resolved ? IconRefresh : IconCheck}
              size={16}
            />
            {thread.data.resolved ? 'Reopen' : 'Resolve'}
          </button>
        )}
        <button
          type="button"
          aria-label="Close comment"
          onClick={commentUi.close}
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ChalklineIcon icon={IconX} size={16} />
        </button>
      </header>

      {messages.length > 0 && (
        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {messages.map((message) => (
            <li key={message.id} className="flex gap-2">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-canvas"
                style={{ backgroundColor: message.color }}
              >
                {initials(message.author)}
              </span>
              <div className="min-w-0">
                <p className="text-label">
                  <span className="font-bold">{message.author}</span>{' '}
                  <time
                    dateTime={new Date(message.at).toISOString()}
                    className="text-ink-muted"
                  >
                    {timeFormat.format(message.at)}
                  </time>
                </p>
                <p className="text-body break-words whitespace-pre-wrap">
                  {message.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {canEdit ? (
        <form
          className="flex flex-col gap-2 border-t border-border p-3"
          onSubmit={(event) => {
            event.preventDefault()
            post()
          }}
        >
          <label htmlFor={`${titleId}-text`} className="sr-only">
            {thread ? 'Reply' : 'Comment'}
          </label>
          <textarea
            ref={input}
            id={`${titleId}-text`}
            value={text}
            maxLength={MAX_TEXT}
            rows={2}
            placeholder={thread ? 'Reply…' : 'Add a comment…'}
            onChange={(event) => {
              setText(event.target.value)
            }}
            onKeyDown={(event) => {
              // Enter posts; Shift+Enter adds a line.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                post()
              }
            }}
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-body text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-focus-ring"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!text.trim()}
              className={primaryButtonClass}
            >
              <ChalklineIcon icon={IconCornerDownLeft} size={16} />
              {thread ? 'Reply' : 'Comment'}
            </button>
          </div>
        </form>
      ) : (
        <p className="border-t border-border p-3 text-label text-ink-muted">
          You opened a view-only link, so you can read comments but not add
          them.
        </p>
      )}
    </section>
  )
}
