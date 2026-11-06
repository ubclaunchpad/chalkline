package realtime

import (
	"encoding/json"
	"slices"
	"sync"

	"github.com/coder/websocket"
)

type Room struct {
	mu      sync.Mutex
	clients map[string]*Client // client ID → connected client
}

func (r *Room) broadcast(sender *Client, msg message) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.broadcastLocked(sender, msg)
}

// broadcastLocked requires r.mu. The lock orders concurrent broadcasts so all
// recipients have messages queued in the same order. No network writes occur
// here: each client's writer drains its own queue after we release the lock.
func (r *Room) broadcastLocked(sender *Client, msg message) {
	for _, client := range r.clients {
		if client != sender {
			client.enqueue(msg)
		}
	}
}

// participantsLocked requires r.mu. Capturing the roster under the same lock
// that queues it means every client receives rosters in membership order, so
// the last one each client gets matches the room.
func (r *Room) participantsLocked() message {
	ids := make([]string, 0, len(r.clients))
	for id := range r.clients {
		ids = append(ids, id)
	}
	// Clients treat the list as a set; sorting only makes the bytes predictable.
	slices.Sort(ids)
	// A struct of strings always marshals successfully.
	data, _ := json.Marshal(struct {
		Type      string   `json:"type"`
		ClientIDs []string `json:"clientIds"`
	}{Type: "participants", ClientIDs: ids})
	return message{kind: websocket.MessageText, data: data}
}
