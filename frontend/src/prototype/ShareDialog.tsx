import { useEffect, useState } from 'react'

export default function ShareDialog({
  boardId,
  onClose,
}: {
  boardId: string
  onClose: () => void
}) {
  const base = `${window.location.origin}${window.location.pathname}`
  const links = [
    {
      label: 'Can edit',
      hint: 'Anyone with this link can change the board.',
      url: `${base}#/b/${boardId}`,
    },
    {
      label: 'Can view',
      hint: 'Sees live changes but cannot edit.',
      url: `${base}#/b/${boardId}/view`,
    },
  ]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 id="share-title" className="text-lg font-semibold">
            Share this board
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {links.map((link) => (
            <LinkRow key={link.label} {...link} />
          ))}
        </div>
        <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Prototype: there is no server yet, so these links only open the board
          in this browser. Try the view link in a new tab to see the read-only
          experience.
        </p>
      </div>
    </div>
  )
}

function LinkRow({
  label,
  hint,
  url,
}: {
  label: string
  hint: string
  url: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="mt-1.5 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600"
          aria-label={`${label} link`}
        />
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="w-20 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Open
        </a>
      </div>
    </div>
  )
}
