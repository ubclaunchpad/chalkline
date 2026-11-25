package realtime

import (
	"context"
	"io"
	"sync"
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
	// rosterMarker stands in for the client's newest roster. The writer replaces
	// it with whatever roster is in the client's slot when it reaches the marker.
	rosterMarker bool
}

// Client represents one browser tab's active WebSocket connection.
type Client struct {
	id       string          // Server-assigned ID for this connection.
	conn     *websocket.Conn // Used by this client's read and write loops.
	outgoing chan message    // Messages queued for this browser, not received from it.
	cancel   context.CancelFunc

	// Only the newest roster matters, so at most one roster marker waits in
	// outgoing. Without this, a burst of departures queues one roster per
	// departure and overflows healthy clients.
	rosterMu      sync.Mutex
	roster        message // Newest roster for this client, guarded by rosterMu.
	rosterPending bool    // A marker is in outgoing and not yet resolved.
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
			c.enqueue(errorMessage(&protocolError{code: codeMessageTooLarge, message: "message too large"}, ""))
			// Consume the rest before reading the next message. Discarding streams
			// the bytes without retaining them; cancellation still stops this read.
			if _, err := io.Copy(io.Discard, reader); err != nil {
				return
			}
			continue
		}
		if kind != websocket.MessageText {
			c.enqueue(errorMessage(invalidMessage("message must be text JSON"), ""))
			continue
		}
		p, perr := prepareMessage(data, c.id)
		if perr != nil {
			c.enqueue(errorMessage(perr, p.batchID))
			continue
		}
		if p.kind == "cursor" {
			room.broadcast(c, p.encoded)
			continue
		}
		room.applyChange(c, p)
	}
}

func (c *Client) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.outgoing:
			msg = c.resolve(msg)
			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Write(writeCtx, msg.kind, msg.data)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// enqueueRoster stores msg as the client's newest roster and queues a marker
// only if none is waiting. Callers hold the room lock, so rosters are stored in
// membership order and the last roster the writer sends matches the room.
func (c *Client) enqueueRoster(msg message) {
	c.rosterMu.Lock()
	c.roster = msg
	pending := c.rosterPending
	c.rosterPending = true
	c.rosterMu.Unlock()
	if !pending {
		c.enqueue(message{rosterMarker: true})
	}
}

// resolve turns a roster marker into the newest stored roster. Clearing the
// pending flag in the same critical section as reading the slot matters: if the
// flag were cleared after the read, a roster stored in between would find a
// marker "pending", queue none, and never be sent.
func (c *Client) resolve(msg message) message {
	if !msg.rosterMarker {
		return msg
	}
	c.rosterMu.Lock()
	defer c.rosterMu.Unlock()
	c.rosterPending = false
	return c.roster
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
