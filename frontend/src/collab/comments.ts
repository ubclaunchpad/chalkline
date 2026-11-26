// Comment threads live on the board as small, locked, invisible ellipses whose
// customData holds the messages (see docs/prototype/CONVENTIONS.md). Being
// ordinary elements, they sync, persist and replay like any other shape.
import {
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export interface CommentMessage {
  id: string
  author: string
  color: string
  text: string
  at: number
}

export interface CommentData {
  v: 1
  annotation: 'comment'
  targetId?: string
  resolved: boolean
  messages: CommentMessage[]
}

export interface Thread {
  id: string
  element: ExcalidrawElement
  data: CommentData
}

/** Longest message we keep; the whole board must fit in 1 MiB. */
export const MAX_TEXT = 2000
const PIN_SIZE = 24

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMessage(value: unknown): CommentMessage | null {
  if (!isRecord(value)) return null
  const { id, author, color, text, at } = value
  if (
    typeof id !== 'string' ||
    typeof author !== 'string' ||
    typeof color !== 'string' ||
    typeof text !== 'string' ||
    typeof at !== 'number'
  )
    return null
  return { id, author, color, text, at }
}

/**
 * Reads comment data from an element, or null if it is not a valid thread.
 * customData comes from other browsers, so every field is checked.
 */
export function readComment(element: ExcalidrawElement): CommentData | null {
  const data: unknown = element.customData
  if (!isRecord(data) || data.v !== 1 || data.annotation !== 'comment')
    return null
  if (typeof data.resolved !== 'boolean' || !Array.isArray(data.messages))
    return null
  const messages = data.messages.map(readMessage)
  if (messages.some((message) => message === null)) return null
  return {
    v: 1,
    annotation: 'comment',
    ...(typeof data.targetId === 'string' && { targetId: data.targetId }),
    resolved: data.resolved,
    messages: messages as CommentMessage[],
  }
}

/** Every live thread on the board, oldest first. */
export function threadsOf(elements: readonly ExcalidrawElement[]): Thread[] {
  const threads: Thread[] = []
  for (const element of elements) {
    if (element.isDeleted) continue
    const data = readComment(element)
    if (data) threads.push({ id: element.id, element, data })
  }
  return threads.sort(
    (a, b) => (a.data.messages[0]?.at ?? 0) - (b.data.messages[0]?.at ?? 0),
  )
}

export const openThreads = (threads: readonly Thread[]) =>
  threads.filter((thread) => !thread.data.resolved)

/**
 * True for elements a comment can follow: components, groups, sticky notes.
 * Locked elements (comment pins, board info) and arrows are skipped, and a
 * bound label is skipped so the click lands on its card underneath.
 */
const isTarget = (element: ExcalidrawElement) =>
  !element.isDeleted &&
  !element.locked &&
  !['text', 'arrow', 'line', 'freedraw'].includes(element.type)

/** The topmost element under a scene point that a new comment should follow. */
export function targetAt(
  elements: readonly ExcalidrawElement[],
  x: number,
  y: number,
): ExcalidrawElement | undefined {
  // shortcut: bounding boxes only and ignores rotation; fine for cards and groups.
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]
    if (!isTarget(element)) continue
    const left = Math.min(element.x, element.x + element.width)
    const top = Math.min(element.y, element.y + element.height)
    const width = Math.abs(element.width)
    const height = Math.abs(element.height)
    if (x >= left && x <= left + width && y >= top && y <= top + height)
      return element
  }
  return undefined
}

/**
 * Where a thread's pin sits in scene coordinates: the top-right corner of its
 * target, so it follows the component, or where it was dropped otherwise.
 */
export function pinPoint(
  thread: Thread,
  byId: ReadonlyMap<string, ExcalidrawElement>,
): { x: number; y: number } {
  const target = thread.data.targetId
    ? byId.get(thread.data.targetId)
    : undefined
  if (target && !target.isDeleted) return cornerOf(target)
  return {
    x: thread.element.x + PIN_SIZE / 2,
    y: thread.element.y + PIN_SIZE / 2,
  }
}

/** An element's top-right corner, where its comment pin sits. */
export const cornerOf = (element: ExcalidrawElement) => ({
  x: Math.max(element.x, element.x + element.width),
  y: Math.min(element.y, element.y + element.height),
})

export function newMessage(
  author: { name: string; color: string },
  text: string,
  at = Date.now(),
): CommentMessage {
  return {
    id: crypto.randomUUID(),
    author: author.name,
    color: author.color,
    text: text.trim().slice(0, MAX_TEXT),
    at,
  }
}

/** A new thread element at a scene point, optionally following a target. */
export function createThread(
  point: { x: number; y: number },
  targetId: string | undefined,
  first: CommentMessage,
): ExcalidrawElement {
  const data: CommentData = {
    v: 1,
    annotation: 'comment',
    ...(targetId && { targetId }),
    resolved: false,
    messages: [first],
  }
  const [element] = convertToExcalidrawElements([
    {
      type: 'ellipse',
      x: point.x - PIN_SIZE / 2,
      y: point.y - PIN_SIZE / 2,
      width: PIN_SIZE,
      height: PIN_SIZE,
      // The overlay draws the pin; the element only carries the thread.
      opacity: 0,
      locked: true,
      customData: data,
    },
  ])
  return element
}

function withData(thread: Thread, data: CommentData): ExcalidrawElement {
  return newElementWith(thread.element, { customData: data })
}

export const addReply = (thread: Thread, message: CommentMessage) =>
  withData(thread, {
    ...thread.data,
    messages: [...thread.data.messages, message],
  })

export const setResolved = (thread: Thread, resolved: boolean) =>
  withData(thread, { ...thread.data, resolved })

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      String.fromCodePoint(part.codePointAt(0) ?? 0).toLocaleUpperCase(),
    )
    .join('')
}
