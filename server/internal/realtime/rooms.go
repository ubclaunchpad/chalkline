package realtime

import "sync"

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
