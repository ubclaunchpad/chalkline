package realtime

import (
	"context"
	"time"

	"github.com/coder/websocket"
)

const (
	outgoingCapacity = 64
	writeTimeout     = 10 * time.Second
)

// A message keeps its WebSocket type because this transport layer does not yet
// interpret application JSON. Treat data as immutable once it is queued.
type message struct {
	kind websocket.MessageType
	data []byte
}

// Client represents one browser tab's active WebSocket connection.
type Client struct {
	id       string          // Server-assigned ID for this connection.
	conn     *websocket.Conn // Used by this client's read and write loops.
	outgoing chan message    // Messages queued for this browser, not received from it.
	cancel   context.CancelFunc
}

func newClient(id string, conn *websocket.Conn, cancel context.CancelFunc) *Client {
	return &Client{
		id:       id,
		conn:     conn,
		outgoing: make(chan message, outgoingCapacity),
		cancel:   cancel,
	}
}

// run owns the connection's lifetime. The HTTP handler is already running in a
// goroutine, so it can read while one additional goroutine writes to the same
// bidirectional connection.
func (c *Client) run(ctx context.Context, room *Room) {
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		defer c.cancel() // A failed write also stops the reader.
		c.writeLoop(ctx)
	}()

	c.readLoop(ctx, room)
	c.cancel() // A failed read also stops the writer, even if its queue is empty.
	_ = c.conn.CloseNow()
	<-writerDone // Do not leave a writer goroutine behind when the handler exits.
}

func (c *Client) readLoop(ctx context.Context, room *Room) {
	for {
		kind, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		// TODO: Validate application messages and attach the trusted sender ID.
		room.broadcast(c, message{kind: kind, data: data})
	}
}

func (c *Client) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.outgoing:
			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Write(writeCtx, msg.kind, msg.data)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *Client) enqueue(msg message) {
	select {
	case c.outgoing <- msg:
	default:
		// Never wait for a slow browser while holding the room lock. Disconnect
		// it instead; dropping arbitrary edits would silently diverge its board.
		c.cancel()
	}
	// We never close outgoing: a concurrent broadcaster could still send to it.
	// Cancellation stops the loops, and the queue is garbage collected with Client.
}
