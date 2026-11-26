package realtime

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"sync"

	"github.com/coder/websocket"
)

type Hub struct {
	clients           sync.WaitGroup
	store             PersistenceStore
	persistenceConfig PersistenceConfig
	workerCtx         context.Context
	cancelWorkers     context.CancelFunc
	workers           sync.WaitGroup
	closing           bool
	mu                sync.Mutex
	rooms             map[string]*Room // board ID → room
	access            AccessStore      // nil: every connection can edit
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*Room)}
}

// WithAccess makes the hub check share keys. Call it before serving.
func (h *Hub) WithAccess(access AccessStore) *Hub {
	h.access = access
	return h
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	boardID := r.URL.Query().Get("board")
	if err := validateBoardID(boardID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	grant := Grant{}
	if h.access != nil {
		var err error
		// Never log the key: it is the board's password.
		query := r.URL.Query()
		grant, err = h.access.Grant(r.Context(), boardID, query.Get("key"), query.Get("claim"))
		if errors.Is(err, ErrForbidden) {
			refuse(w, r)
			return
		}
		if err != nil {
			http.Error(w, "board unavailable", http.StatusServiceUnavailable)
			return
		}
	}
	if h.store != nil {
		room, err := h.reserve(r.Context(), boardID)
		if err != nil {
			http.Error(w, "board unavailable", http.StatusServiceUnavailable)
			return
		}
		defer h.releaseReservation(boardID, room)
	}
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()
	// The library's read limit closes oversized connections. Our reader instead
	// bounds allocation, replies with an error, and drains the rejected message.
	conn.SetReadLimit(-1)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	client := newClient("c_"+rand.Text(), conn, cancel)
	client.viewOnly = grant.Access == AccessView

	// Queue welcome before making the client visible to broadcasters. Its single
	// writer will send this first, even if someone broadcasts during the join.
	client.enqueue(welcomeMessage(client.id, grant))
	room := h.join(boardID, client)
	if room == nil {
		return
	}
	defer h.leave(boardID, room, client)

	// The handler stays alive for this connection. Only this handler removes the
	// membership, so read and write failures cannot announce two departures.
	client.run(ctx, room)
}

// refuse upgrades the connection only to say why it is closing. A plain HTTP
// 403 would look like a network failure to the browser, which would retry
// forever.
func refuse(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()
	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()
	msg := errorMessage(&protocolError{code: codeKeyRequired, message: ErrForbidden.Error()}, "")
	if conn.Write(ctx, msg.kind, msg.data) == nil {
		_ = conn.Close(websocket.StatusPolicyViolation, "forbidden")
	}
}

func (h *Hub) join(boardID string, client *Client) *Room {
	// Always acquire hub then room when both are needed. Keeping lookup and
	// registration together prevents joining a room that was just deleted.
	// The snapshot is queued under the room lock, so no change is missed
	// between the snapshot and later broadcasts (G2).
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closing {
		return nil
	}
	room := h.rooms[boardID]
	if room == nil {
		room = &Room{clients: make(map[string]*Client), scene: newScene()}
		h.rooms[boardID] = room
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	client.enqueue(snapshotMessage(room.scene.snapshot()))
	room.clients[client.id] = client
	h.clients.Add(1)
	// Includes the newcomer, whose welcome and snapshot are already queued first.
	room.broadcastRosterLocked()
	return room // A pointer: every client uses the same Room, including its mutex.
}

func (h *Hub) leave(boardID string, room *Room, client *Client) {
	msg := lifecycleMessage("leave", client.id)
	h.mu.Lock()
	defer h.mu.Unlock()
	room.mu.Lock()
	defer room.mu.Unlock()
	delete(room.clients, client.id)
	h.clients.Done()
	room.broadcastLocked(client, msg)
	if len(room.clients) == 0 && room.persistence == nil {
		delete(h.rooms, boardID)
		return
	}
	room.signalPersistence()
	// A client whose roster marker is still queued from an earlier change gets
	// this newer roster at that earlier position, possibly before this leave.
	room.broadcastRosterLocked()
}
