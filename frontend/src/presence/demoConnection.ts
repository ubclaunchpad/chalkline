import type { ServerMessage } from '../realtime/messages'
import { createIdentity } from './identity'
import type { PresenceConnection } from './presence'

// Loaded only by the development demo. No network connection is created.
export function createDemoConnection() {
  const listeners = new Set<(message: ServerMessage) => void>()
  let moving = true
  const users = new Map([
    ['demo-alice', { name: 'Alice', x: 240, y: 260 }],
    ['demo-bob', { name: 'Bob', x: 440, y: 320 }],
  ])
  let nextUser = 3
  let frame = 0
  const emit = (message: ServerMessage) => {
    listeners.forEach((listener) => {
      listener(message)
    })
  }
  const update = () => {
    if (!moving) return
    frame++
    const offset = Math.sin(frame / 20) * 70
    for (const [clientId, user] of users) {
      emit({
        type: 'cursor',
        from: clientId,
        ...createIdentity(user.name),
        x: user.x + offset,
        y: user.y,
      })
    }
  }
  const connection: PresenceConnection = {
    send: () => {
      /* Demo movement stays in this tab. */
    },
    on(type, handler) {
      const listener = (message: ServerMessage) => {
        if (message.type === type)
          handler(message as Extract<ServerMessage, { type: typeof type }>)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    status: () => 'open',
    onStatus: () => () => {
      /* Always open in the demo. */
    },
    clientId: () => 'demo-you',
  }
  return {
    connection,
    start() {
      update()
      const timer = setInterval(update, 67)
      return () => {
        clearInterval(timer)
      }
    },
    setMoving(value: boolean) {
      moving = value
      update()
    },
    addUser() {
      const number = nextUser++
      const clientId = `demo-user-${String(number)}`
      const user = {
        name: `Demo user ${String(number)}`,
        x: 200 + ((number - 1) % 4) * 120,
        y: 200 + (Math.floor((number - 1) / 4) % 4) * 80,
      }
      users.set(clientId, user)
      emit({
        type: 'cursor',
        from: clientId,
        ...createIdentity(user.name),
        x: user.x,
        y: user.y,
      })
    },
    removeUser() {
      const clientId = [...users.keys()].at(-1)
      if (!clientId) return
      users.delete(clientId)
      emit({ type: 'leave', clientId })
    },
  }
}
