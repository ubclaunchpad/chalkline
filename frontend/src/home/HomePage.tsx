import { useState } from 'react'
import { IconChevronRight, IconPlus } from '@tabler/icons-react'
import { ChalklineIcon } from '../design/Icon'
import { Logo } from '../design/Logo'
import { TemplateGallery } from '../templates/TemplateGallery'
import { boardUrl, loadRecentBoards, newBoardId } from './recentBoards'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function openBoard(template?: string) {
  window.location.assign(boardUrl(newBoardId(), template))
}

/** Shown when the address has no ?board=: start a board or reopen one. */
export function HomePage() {
  const [recent] = useState(loadRecentBoards)

  return (
    <div className="min-h-dvh bg-canvas font-sans text-body text-ink">
      <header className="flex h-12 items-center border-b border-border bg-bg px-4">
        <Logo className="h-auto w-24" />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold">Your boards</h1>
            <p className="mt-1 text-ink-muted">
              Sketch a system together. Components and connections keep their
              meaning.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              openBoard()
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-accent-pressed"
          >
            <ChalklineIcon icon={IconPlus} size={18} />
            New board
          </button>
        </section>

        <section aria-labelledby="recent-title">
          <h2
            id="recent-title"
            className="mb-3 text-label font-bold tracking-wide text-ink-muted uppercase"
          >
            Recent
          </h2>
          {recent.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-ink-muted">
              Boards you open show up here.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((board) => (
                <li key={board.id}>
                  <a
                    href={boardUrl(board.id)}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/60 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {board.name}
                      </span>
                      <span className="block truncate text-label text-ink-muted">
                        Opened {dateFormat.format(board.lastOpened)}
                      </span>
                    </span>
                    <ChalklineIcon
                      icon={IconChevronRight}
                      size={18}
                      className="shrink-0 text-ink-muted group-hover:text-ink"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="templates-title">
          <h2
            id="templates-title"
            className="mb-3 text-label font-bold tracking-wide text-ink-muted uppercase"
          >
            Start from a template
          </h2>
          <TemplateGallery
            onChoose={(templateId) => {
              openBoard(templateId)
            }}
          />
        </section>
      </main>
    </div>
  )
}
