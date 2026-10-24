package realtime

import (
	"net/http"
	"sync"
)

type Hub struct {
	mu    sync.Mutex
	rooms map[string]*Room // board ID → room
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*Room)}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// TODO: Accept the WebSocket connection and join its board's room.
	http.Error(w, "WebSocket support is not implemented yet", http.StatusNotImplemented)
}
