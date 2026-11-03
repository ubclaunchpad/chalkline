// Stands in for the browser's WebSocket so tests need no server.
// Unlike a real socket, close() calls onclose straight away rather than
// later, so don't rely on that ordering in connection.ts.
export class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  url: string
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }

  // Helpers that act like the server.
  serverOpens() {
    this.onopen?.()
  }
  serverSends(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  serverDrops() {
    this.onclose?.()
  }
}
