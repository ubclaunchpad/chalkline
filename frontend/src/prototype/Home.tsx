import { useState } from 'react'
import { exampleElements } from './example'
import { randomId } from './elements'
import { deleteBoard, listBoards, saveBoardMeta, saveElements } from './storage'

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function createBoard(name: string, withExample: boolean) {
  const id = randomId(8)
  saveBoardMeta({ id, name, updatedAt: Date.now() })
  if (withExample) saveElements(id, exampleElements())
  window.location.hash = `#/b/${id}`
}

export default function Home() {
  const [boards, setBoards] = useState(listBoards)

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">
          Chalkline · prototype
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Design systems together.
        </h1>
        <p className="mt-3 max-w-xl text-lg text-slate-600">
          A shared whiteboard where a database is a database. Place typed
          components, connect them, invite a teammate, and get feedback on the
          architecture you drew.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => createBoard('Untitled board', false)}
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700"
          >
            New board
          </button>
          <button
            onClick={() => createBoard('URL shortener', true)}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium hover:bg-slate-100"
          >
            Start from an example
          </button>
        </div>

        <section className="mt-14">
          <h2 className="text-sm font-semibold text-slate-500">Your boards</h2>
          {boards.length === 0 ? (
            <p className="mt-3 text-slate-500">
              No boards yet. Create one above.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {boards.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <a
                    href={`#/b/${b.id}`}
                    className="font-medium hover:underline"
                  >
                    {b.name}
                  </a>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span>Edited {timeAgo(b.updatedAt)}</span>
                    <button
                      onClick={() => {
                        deleteBoard(b.id)
                        setBoards(listBoards())
                      }}
                      className="rounded px-2 py-1 hover:bg-slate-100 hover:text-red-600"
                      aria-label={`Delete ${b.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Prototype: boards are stored in this browser only. Teammates, sync,
            and sharing are simulated.
          </p>
        </section>
      </div>
    </main>
  )
}
