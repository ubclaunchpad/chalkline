import { useEffect, useId, useRef, useState } from 'react'
import {
  IconCheck,
  IconCopy,
  IconEye,
  IconPencil,
  IconShare,
  IconX,
} from '@tabler/icons-react'
import { useBoard } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import type { BoardKeys } from '../realtime/messages'
import { rememberEditKey, shareLink } from '../realtime/shareKeys'
import { useBoardConnection } from '../realtime/useBoardConnection'
import { plainButtonClass, primaryButtonClass } from './shared'

/**
 * Applies the access the server granted in `welcome` and keeps the share keys
 * it sent. Only edit connections receive keys.
 */
function useShareKeys(): BoardKeys | null {
  const { boardId, setAccess } = useBoard()
  const connection = useBoardConnection()
  const [keys, setKeys] = useState<BoardKeys | null>(null)
  useEffect(
    () =>
      connection?.on('welcome', (welcome) => {
        // No access field means the server does not check keys: everyone edits.
        setAccess(welcome.access ?? 'edit')
        setKeys(welcome.keys ?? null)
        if (welcome.keys) rememberEditKey(boardId, welcome.keys.edit)
      }),
    [connection, boardId, setAccess],
  )
  return keys
}

export function ShareButton() {
  const keys = useShareKeys()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true)
        }}
        className={`${primaryButtonClass} h-9`}
      >
        <ChalklineIcon icon={IconShare} size={18} />
        Share
      </button>
      {open && (
        <ShareDialog
          keys={keys}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

export function ShareDialog({
  keys,
  onClose,
}: {
  keys: BoardKeys | null
  onClose: () => void
}) {
  const { boardId, access } = useBoard()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
    }
  }, [])

  // Editors get both links. A viewer can only pass on the link they opened.
  const links = keys
    ? [
        { can: 'edit', url: shareLink(boardId, keys.edit) },
        { can: 'view', url: shareLink(boardId, keys.view) },
      ]
    : [{ can: access, url: window.location.href }]

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-lg font-bold">
              Share this board
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-label text-ink-muted">
              <ChalklineIcon
                icon={access === 'edit' ? IconPencil : IconEye}
                size={16}
              />
              {access === 'edit'
                ? 'You can edit this board.'
                : 'You opened a view-only link. You can look but not change anything.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close share dialog"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <ChalklineIcon icon={IconX} size={18} />
          </button>
        </div>

        {links.map((link) => (
          <LinkRow key={link.can} can={link.can} url={link.url} />
        ))}

        <p className="text-label text-ink-muted">
          {keys
            ? 'People without a link cannot open this board. In this prototype the links stop working if the server restarts.'
            : access === 'edit'
              ? 'This server does not check share links, so anyone who can open the board can edit it.'
              : 'Ask an editor if you need an edit link.'}
        </p>
      </div>
    </dialog>
  )
}

function LinkRow({ can, url }: { can: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      // Clipboard can be blocked; select the text so Ctrl+C works.
      input.current?.select()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 font-semibold">
        <ChalklineIcon icon={can === 'edit' ? IconPencil : IconEye} size={16} />
        Anyone with this link can {can}
      </label>
      <div className="flex gap-2">
        <input
          ref={input}
          id={id}
          readOnly
          value={url}
          onFocus={(event) => {
            event.target.select()
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-label text-ink-muted focus-visible:outline-2 focus-visible:outline-focus-ring"
        />
        <button
          type="button"
          onClick={() => {
            void copy()
          }}
          aria-label={`Copy ${can} link`}
          className={`${plainButtonClass} border border-border`}
        >
          <ChalklineIcon icon={copied ? IconCheck : IconCopy} size={16} />
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  )
}
