import { useEffect, useRef, useState } from 'react'
import { createIdentity, guestName } from './identity'
import type { Identity } from './identity'

export function NameDialog({
  onSubmit,
}: {
  onSubmit: (identity: Identity) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(guestName)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element?.showModal()
    input.current?.focus()
    input.current?.select()
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="presence-name-title"
      aria-describedby="presence-name-description"
      onCancel={(event) => {
        event.preventDefault()
        onSubmit(createIdentity(guestName()))
      }}
      className="m-auto w-80 rounded-xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/40"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onSubmit(createIdentity(name))
        }}
      >
        <h1 id="presence-name-title" className="text-lg font-semibold">
          What's your name?
        </h1>
        <p id="presence-name-description" className="mt-2 text-sm">
          Choose a name for others on this board. Press Escape to continue as a
          guest.
        </p>
        <label
          htmlFor="presence-name"
          className="mt-4 block text-sm font-medium"
        >
          Display name
        </label>
        <input
          ref={input}
          id="presence-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          required
          maxLength={80}
          autoComplete="nickname"
          className="mt-1 w-full rounded border border-slate-500 p-2 focus-visible:outline-2 focus-visible:outline-blue-600"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="mt-4 rounded bg-blue-700 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
        >
          Join board
        </button>
      </form>
    </dialog>
  )
}
