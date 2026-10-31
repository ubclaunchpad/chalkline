import { afterEach, expect, it, vi } from 'vitest'
import { createIdentity } from './identity'
import { createDemoConnection } from './demoConnection'
import { startPresence } from './presence'
import type { Participant } from './presence'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('demonstrates adding/removing users, movement, expiry, and timer cleanup through real presence logic', () => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'performance',
    ],
  })
  const demo = createDemoConnection()
  let participants: ReadonlyMap<string, Participant> = new Map()
  const session = startPresence(
    demo.connection,
    createIdentity('You'),
    (next) => {
      participants = next
    },
  )
  const stop = demo.start()
  expect([...participants.keys()]).toEqual(['demo-alice', 'demo-bob'])
  const firstX = participants.get('demo-alice')?.x
  vi.advanceTimersByTime(67)
  expect(participants.get('demo-alice')?.x).not.toBe(firstX)
  demo.addUser()
  expect([...participants.keys()]).toEqual([
    'demo-alice',
    'demo-bob',
    'demo-user-3',
  ])
  demo.removeUser()
  expect([...participants.keys()]).toEqual(['demo-alice', 'demo-bob'])
  demo.removeUser()
  expect([...participants.keys()]).toEqual(['demo-alice'])
  demo.setMoving(false)
  vi.advanceTimersByTime(11000)
  expect(participants.size).toBe(0)
  demo.setMoving(true)
  expect([...participants.keys()]).toEqual(['demo-alice'])
  demo.removeUser()
  demo.removeUser() // Removing from an empty demo is harmless.
  expect(participants.size).toBe(0)
  demo.setMoving(false)
  demo.addUser() // A new user appears even when movement is paused.
  expect([...participants.keys()]).toEqual(['demo-user-4'])
  vi.advanceTimersByTime(10000)
  expect(participants.size).toBe(0)
  demo.setMoving(true)
  expect([...participants.keys()]).toEqual(['demo-user-4'])
  stop()
  session.dispose()
  expect(vi.getTimerCount()).toBe(0)
  // React StrictMode can start the demo again after cleaning up its first run.
  const stopAgain = demo.start()
  stopAgain()
  expect(vi.getTimerCount()).toBe(0)
})
