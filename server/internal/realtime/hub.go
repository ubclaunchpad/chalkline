package realtime

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/coder/websocket"
)

type Hub struct {
	mu    sync.Mutex
	rooms map[string]*Room // board ID → room
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*Room)}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// TODO: Validate the board ID before upgrading this HTTP request.
	boardID := r.URL.Query().Get("board")
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	client := newClient("c_"+rand.Text(), conn, cancel)

	// Queue welcome before making the client visible to broadcasters. Its single
	// writer will send this first, even if someone broadcasts during the join.
	client.enqueue(lifecycleMessage("welcome", client.id))
	room := h.join(boardID, client)
	defer h.leave(boardID, room, client)

	// The handler stays alive for this connection. Only this handler removes the
	// membership, so read and write failures cannot announce two departures.
	client.run(ctx, room)
}

func (h *Hub) join(boardID string, client *Client) *Room {
	// Always acquire hub then room when both are needed. Keeping lookup and
	// registration together prevents joining a room that was just deleted.
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[boardID]
	if room == nil {
		room = &Room{clients: make(map[string]*Client)}
		h.rooms[boardID] = room
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	room.clients[client.id] = client
	return room // A pointer: every client uses the same Room, including its mutex.
}

func (h *Hub) leave(boardID string, room *Room, client *Client) {
	msg := lifecycleMessage("leave", client.id)
	h.mu.Lock()
	defer h.mu.Unlock()
	room.mu.Lock()
	defer room.mu.Unlock()
	delete(room.clients, client.id)
	room.broadcastLocked(client, msg)
	if len(room.clients) == 0 {
		delete(h.rooms, boardID)
	}
}

func lifecycleMessage(kind, clientID string) message {
	// A struct with only string fields always marshals successfully. Encoding
	// happens once; recipients can share the resulting immutable bytes.
	data, _ := json.Marshal(struct {
		Type     string `json:"type"`
		ClientID string `json:"clientId"`
	}{Type: kind, ClientID: clientID})
	return message{kind: websocket.MessageText, data: data}
}
