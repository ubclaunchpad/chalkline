package realtime

import "sync"

type Room struct {
	persistence *roomPersistence
	mu          sync.Mutex
	clients     map[string]*Client // client ID → connected client
	scene       *scene             // The room's copy of its board, guarded by mu.
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

// applyChange merges a change into the room's board. Winners go to everyone
// else, and the sender gets the stored copy of anything it lost. Holding mu
// for the whole step keeps the board and the order of queued messages in
// step, so a snapshot taken in join never misses or repeats a change.
func (r *Room) applyChange(sender *Client, p prepared) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.persistence != nil && (r.persistence.paused || r.persistence.closing) {
		sender.enqueue(errorMessage(persistenceError(), p.batchID))
		return
	}
	// Stage on a shallow copy: stored element bytes are immutable.
	candidate := r.scene
	if r.persistence != nil {
		candidate = newScene()
		candidate.rawBytes = r.scene.rawBytes
		for id, e := range r.scene.elements {
			candidate.elements[id] = e
		}
	}
	winners, corrections, perr := candidate.apply(p.elements)
	if perr != nil {
		sender.enqueue(errorMessage(perr, p.batchID))
		return
	}
	if len(winners) > 0 && r.persistence != nil {
		raw := joinElements("[", winners, "]")
		q := r.persistence
		if len(q.pending) >= q.limits.MaxPendingBatches || q.pendingBytes+len(raw) > q.limits.MaxPendingBytes {
			q.paused = len(q.pending) > 0
			r.signalPersistence()
			r.broadcastLocked(sender, errorMessage(persistenceError(), ""))
			sender.enqueue(errorMessage(persistenceError(), p.batchID))
			return
		}
		q.pending = append(q.pending, raw)
		q.pendingBytes += len(raw)
		r.scene = candidate
	}
	if len(winners) > 0 {
		// Every field was decoded from valid JSON, so encoding cannot fail.
		if msg, err := forwardedChange(p.fields, winners); err == nil {
			r.broadcastLocked(sender, msg)
		} else {
			sender.enqueue(errorMessage(invalidMessage("message must be a JSON object"), p.batchID))
		}
	}
	if len(corrections) > 0 {
		sender.enqueue(correctionMessage(corrections))
	}
}
