package realtime

import "github.com/coder/websocket"

// Client represents one browser tab's active WebSocket connection.
type Client struct {
	id       string          // Server-assigned ID for this connection.
	conn     *websocket.Conn // Used by this client's read and write loops.
	outgoing chan []byte     // Encoded JSON messages queued for the write loop.
}
