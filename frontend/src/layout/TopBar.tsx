import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'
import { BoardContext } from '../app/context'
import { ChalklineIcon } from '../design/Icon'
import { Logo } from '../design/Logo'
import { recordBoardVisit } from '../home/recentBoards'
import { useOpenComponentsRequest } from '../shell/componentsPanel'
import {
  boardNameFrom,
  cleanBoardName,
  MAX_BOARD_NAME_LENGTH,
} from './boardInfo'
import { renameBoard } from './renameBoard'

interface TopBarProps {
  boardId: string
  componentsOpen: boolean
  onToggleComponents: () => void
  componentsButtonRef?: Ref<HTMLButtonElement>
  status: ReactNode
  participants: ReactNode
  actions?: ReactNode
}

const ICON_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring'

/** Product chrome above the board. Only working actions should fill its slots. */
export function TopBar({
  boardId,
  componentsOpen,
  onToggleComponents,
  componentsButtonRef,
  status,
  participants,
  actions,
}: TopBarProps) {
  const toggleLabel = componentsOpen
    ? 'Hide components panel'
    : 'Show components panel'

  // The toolbar and empty state ask for the panel; App gave us the toggle.
  useOpenComponentsRequest(
    useCallback(() => {
      if (!componentsOpen) onToggleComponents()
    }, [componentsOpen, onToggleComponents]),
  )

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg px-2 text-ink sm:gap-3 sm:px-3">
      <a
        href="/"
        title="All boards"
        className="shrink-0 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <Logo className="h-auto w-20 sm:w-24" />
      </a>

      <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />

      <button
        ref={componentsButtonRef}
        type="button"
        aria-label={toggleLabel}
        aria-controls="component-sidebar"
        aria-expanded={componentsOpen}
        onClick={onToggleComponents}
        className={`${ICON_BUTTON} ${componentsOpen ? 'bg-accent/15 text-accent' : ''}`}
      >
        <ChalklineIcon
          icon={
            componentsOpen
              ? IconLayoutSidebarLeftCollapse
              : IconLayoutSidebarLeftExpand
          }
          size={20}
        />
      </button>

      <BoardName boardId={boardId} />

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {participants}
        {actions && (
          <div className="flex min-w-0 items-center gap-1 [&>*]:shrink-0">
            {actions}
          </div>
        )}
        {status}
      </div>
    </header>
  )
}

/**
 * The board's name from its board-info element (shared with everyone),
 * falling back to the id. Click to rename.
 */
function BoardName({ boardId }: { boardId: string }) {
  const board = useContext(BoardContext)
  const api = board?.api ?? null
  const canEdit = api !== null && board?.access === 'edit'
  const [name, setName] = useState(boardId)
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    if (!api) return
    const read = () => {
      setName(boardNameFrom(api.getSceneElements(), boardId))
    }
    read()
    return api.onChange(read)
  }, [api, boardId])

  useEffect(() => {
    recordBoardVisit({ id: boardId, name, lastOpened: Date.now() })
  }, [boardId, name])

  const commit = () => {
    const next = draft === null ? null : cleanBoardName(draft)
    setDraft(null)
    if (api && next && next !== name) renameBoard(api, next)
  }

  if (draft !== null) {
    return (
      <input
        aria-label="Board name"
        value={draft}
        maxLength={MAX_BOARD_NAME_LENGTH}
        autoFocus
        onFocus={(event) => {
          event.currentTarget.select()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setDraft(null)
        }}
        className="h-8 w-56 min-w-0 rounded-md border border-accent bg-surface px-2 text-label font-semibold text-ink outline-none"
      />
    )
  }

  if (!canEdit) {
    return (
      <p
        className="min-w-0 max-w-32 truncate px-2 text-label font-semibold text-ink-muted sm:max-w-64"
        title={name}
      >
        <span className="sr-only">Board: </span>
        {name}
      </p>
    )
  }

  return (
    <button
      type="button"
      title="Rename board"
      onClick={() => {
        setDraft(name)
      }}
      className="h-8 min-w-0 max-w-32 shrink truncate rounded-md px-2 text-label font-semibold text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring sm:max-w-64"
    >
      <span className="sr-only">Rename board: </span>
      {name}
    </button>
  )
}
