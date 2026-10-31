package realtime

import (
	"context"
	"io"
	"time"

	"github.com/coder/websocket"
)

const (
	outgoingCapacity = 64
	writeTimeout     = 10 * time.Second
)

// Treat encoded message data as immutable once it is queued for recipients.
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
		kind, reader, err := c.conn.Reader(ctx)
		if err != nil {
			return
		}
		// Read at most the limit plus one byte, so oversized messages never get
		// fully buffered. The extra byte distinguishes exactly-at-limit messages.
		data, err := io.ReadAll(io.LimitReader(reader, maxMessageBytes+1))
		if err != nil {
			return
		}
		if len(data) > maxMessageBytes {
			c.enqueue(errorMessage("message too large"))
			// Consume the rest before reading the next message. Discarding streams
			// the bytes without retaining them; cancellation still stops this read.
			if _, err := io.Copy(io.Discard, reader); err != nil {
				return
			}
			continue
		}
		if kind != websocket.MessageText {
			c.enqueue(errorMessage("message must be text JSON"))
			continue
		}
		msg, err := prepareMessage(data, c.id)
		if err != nil {
			c.enqueue(errorMessage(err.Error()))
			continue
		}
		room.broadcast(c, msg)
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
