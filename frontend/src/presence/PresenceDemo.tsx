import { useEffect, useState } from 'react'
import { PresenceCanvas } from './PresenceCanvas'
import { createDemoConnection } from './demoConnection'

export default function PresenceDemo() {
  const [demo] = useState(createDemoConnection)
  const [moving, setMoving] = useState(true)
  useEffect(() => demo.start(), [demo])

  return (
    <>
      <PresenceCanvas connection={demo.connection} />
      <aside
        aria-label="Presence demo controls"
        className="absolute bottom-20 left-4 z-10 max-w-sm rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1 focus-visible:outline-2 focus-visible:outline-blue-600"
            onClick={() => {
              demo.addUser()
            }}
          >
            Add user
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 focus-visible:outline-2 focus-visible:outline-blue-600"
            onClick={() => {
              demo.removeUser()
            }}
          >
            Remove user
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 focus-visible:outline-2 focus-visible:outline-blue-600"
            onClick={() => {
              demo.setMoving(!moving)
              setMoving(!moving)
            }}
          >
            {moving ? 'Pause movement' : 'Resume movement'}
          </button>
        </div>
      </aside>
    </>
  )
}
