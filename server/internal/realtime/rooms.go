package realtime

import (
	"sync"

	"github.com/coder/websocket"
)

type Room struct {
	mu      sync.Mutex
	clients map[string]*websocket.Conn // client ID → live connection
}
