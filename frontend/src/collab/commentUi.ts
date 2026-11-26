// Transient comment UI shared by the button, pins and panel, which mount in
// different slots. It never goes into the board document.
import { useSyncExternalStore } from 'react'

export interface Draft {
  x: number
  y: number
  targetId?: string
}

export interface CommentUi {
  /** The next click on the board places a new thread. */
  placing: boolean
  /** The thread whose card is open. */
  openId: string | null
  /** A new thread that has a place but no message yet. */
  draft: Draft | null
}

const CLOSED: CommentUi = { placing: false, openId: null, draft: null }
let state = CLOSED
const listeners = new Set<() => void>()

function set(next: CommentUi) {
  state = next
  listeners.forEach((listener) => {
    listener()
  })
}

const get = () => state
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const commentUi = {
  togglePlacing: () => {
    set({ ...CLOSED, placing: !state.placing })
  },
  startDraft: (draft: Draft) => {
    set({ ...CLOSED, draft })
  },
  open: (openId: string) => {
    set({ ...CLOSED, openId })
  },
  close: () => {
    set(CLOSED)
  },
}

export function useCommentUi(): CommentUi {
  return useSyncExternalStore(subscribe, get)
}
