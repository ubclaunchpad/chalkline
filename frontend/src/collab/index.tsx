import { IconMessageCircle, IconMessagePlus, IconX } from '@tabler/icons-react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { useBoard } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { initials, openThreads, type Thread } from './comments'
import { commentUi, useCommentUi } from './commentUi'
import { plainButtonClass, topBarButtonClass, useThreads } from './shared'

export { CommentPins } from './CommentPins'
export { ShareButton } from './ShareButton'

/**
 * Comment mode: the next click on the board starts a thread there, and the
 * comments panel opens. Pressing it again leaves comment mode.
 */
export function CommentsButton() {
  const { access, panel, openPanel, closePanel } = useBoard()
  const { threads } = useThreads()
  const ui = useCommentUi()
  const count = openThreads(threads).length
  const active = ui.placing || panel === 'comments'

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Comments: ${String(count)} open`}
      title={
        access === 'edit'
          ? 'Comment: click a component or the board'
          : 'Comments'
      }
      onClick={() => {
        if (active) {
          commentUi.close()
          if (panel === 'comments') closePanel()
          return
        }
        if (access === 'edit') commentUi.togglePlacing()
        openPanel('comments')
      }}
      className={topBarButtonClass}
    >
      <ChalklineIcon icon={IconMessageCircle} size={18} />
      <span className="max-sm:hidden">Comments</span>
      {count > 0 && (
        <span className="rounded-full bg-surface-overlay px-1.5 text-ink">
          {count}
        </span>
      )}
    </button>
  )
}

function targetName(
  thread: Thread,
  byId: ReadonlyMap<string, ExcalidrawElement>,
): string | null {
  const target = thread.data.targetId
    ? byId.get(thread.data.targetId)
    : undefined
  const name: unknown = (target?.customData as { name?: unknown } | undefined)
    ?.name
  return typeof name === 'string' && name ? name : null
}

export function CommentsPanel() {
  const { api, access, panel, closePanel } = useBoard()
  const { threads, byId } = useThreads()
  const ui = useCommentUi()
  if (panel !== 'comments') return null

  const open = openThreads(threads)
  const resolved = threads.filter((thread) => thread.data.resolved)

  const jump = (thread: Thread) => {
    commentUi.open(thread.id)
    const target = thread.data.targetId
      ? byId.get(thread.data.targetId)
      : undefined
    api?.scrollToContent(target ?? thread.element, {
      animate: true,
      fitToViewport: false,
    })
  }

  const row = (thread: Thread) => {
    const first = thread.data.messages[0]
    const replies = thread.data.messages.length - 1
    const on = targetName(thread, byId)
    return (
      <li key={thread.id}>
        <button
          type="button"
          aria-current={thread.id === ui.openId}
          onClick={() => {
            jump(thread)
          }}
          className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-focus-ring aria-[current=true]:bg-surface-selected"
        >
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-canvas"
            style={{ backgroundColor: first.color }}
          >
            {initials(first.author)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-label text-ink-muted">
              <span className="font-bold text-ink">{first.author}</span>
              {on && <> on {on}</>}
            </span>
            <span className="line-clamp-2 break-words">{first.text}</span>
            {replies > 0 && (
              <span className="block text-label text-ink-muted">
                {replies} {replies === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <aside
      aria-label="Comments"
      className="flex h-full w-80 flex-col border-l border-border bg-surface text-ink max-md:w-full"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <h2 className="text-body font-bold">Comments</h2>
        <button
          type="button"
          onClick={() => {
            commentUi.close()
            closePanel()
          }}
          aria-label="Close comments panel"
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ChalklineIcon icon={IconX} size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {access === 'edit' && (
          <button
            type="button"
            aria-pressed={ui.placing}
            onClick={commentUi.togglePlacing}
            className={`${plainButtonClass} mb-2 w-full justify-start aria-pressed:bg-surface-selected aria-pressed:text-ink`}
          >
            <ChalklineIcon icon={IconMessagePlus} size={18} />
            {ui.placing ? 'Click a component or the board…' : 'Add a comment'}
          </button>
        )}
        {open.length === 0 ? (
          <p className="p-2 text-label text-ink-muted">
            No open comments.
            {access === 'edit' &&
              ' Add one to ask a question about a component.'}
          </p>
        ) : (
          <ul aria-label="Open comments" className="flex flex-col gap-1">
            {open.map(row)}
          </ul>
        )}
        {resolved.length > 0 && (
          <details className="mt-3 border-t border-border pt-2">
            <summary className="cursor-pointer rounded-md p-2 text-label font-semibold text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring">
              Resolved ({resolved.length})
            </summary>
            <ul aria-label="Resolved comments" className="flex flex-col gap-1">
              {resolved.map(row)}
            </ul>
          </details>
        )}
      </div>
    </aside>
  )
}
