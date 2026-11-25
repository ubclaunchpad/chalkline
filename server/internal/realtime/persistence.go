package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/ubclaunchpad/chalkline/server/internal/store"
)

// PersistenceStore is the durable boundary used by live rooms.
type PersistenceStore interface {
	AppendOperations(context.Context, string, int64, []json.RawMessage) (int64, error)
	LoadBoard(context.Context, string) (store.Snapshot, error)
	Checkpoint(context.Context, string) (store.Snapshot, error)
}

type PersistenceConfig struct {
	FlushInterval, CheckpointInterval, RetryInterval, DBTimeout time.Duration
	MaxPendingBytes, MaxPendingBatches                          int
}

func DefaultPersistenceConfig() PersistenceConfig {
	return PersistenceConfig{250 * time.Millisecond, 30 * time.Second, time.Second, 5 * time.Second, 4 << 20, 256}
}

type roomPersistence struct {
	limits                    PersistenceConfig
	ready                     chan struct{}
	loadErr                   error
	reservations              int               // protected by hub.mu
	pending                   []json.RawMessage // protected by room.mu; includes in-flight prefix
	pendingBytes              int
	paused, terminal, closing bool
	sequence                  int64
	wake                      chan struct{}
}

// NewPersistentHub creates a hub with one ordered persistence worker per room.
func NewPersistentHub(s PersistenceStore, cfg PersistenceConfig) (*Hub, error) {
	if s == nil || cfg.FlushInterval <= 0 || cfg.CheckpointInterval <= 0 || cfg.RetryInterval <= 0 || cfg.DBTimeout <= 0 || cfg.MaxPendingBytes <= 0 || cfg.MaxPendingBatches <= 0 {
		return nil, fmt.Errorf("invalid persistence configuration")
	}
	h := NewHub()
	h.store = s
	h.persistenceConfig = cfg
	h.workerCtx, h.cancelWorkers = context.WithCancel(context.Background())
	return h, nil
}

func (h *Hub) reserve(ctx context.Context, id string) (*Room, error) {
	h.mu.Lock()
	if h.closing {
		h.mu.Unlock()
		return nil, fmt.Errorf("server is shutting down")
	}
	room := h.rooms[id]
	if room == nil {
		room = &Room{clients: make(map[string]*Client), scene: newScene(), persistence: &roomPersistence{limits: h.persistenceConfig, ready: make(chan struct{}), wake: make(chan struct{}, 1)}}
		h.rooms[id] = room
		h.workers.Add(1)
		go h.persistRoom(id, room)
	}
	room.persistence.reservations++
	h.mu.Unlock()
	select {
	case <-ctx.Done():
		h.releaseReservation(id, room)
		return nil, ctx.Err()
	case <-room.persistence.ready:
		if room.persistence.loadErr != nil {
			h.releaseReservation(id, room)
			return nil, room.persistence.loadErr
		}
		return room, nil
	}
}

func (h *Hub) releaseReservation(id string, r *Room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r.persistence.reservations--
	if r.persistence.loadErr != nil && r.persistence.reservations == 0 && h.rooms[id] == r {
		delete(h.rooms, id)
	}
	r.signalPersistence()
}

func (r *Room) signalPersistence() {
	if r.persistence != nil {
		select {
		case r.persistence.wake <- struct{}{}:
		default:
		}
	}
}

func hydrate(raw json.RawMessage) (*scene, error) {
	elements, err := parseElements(raw)
	if err != nil {
		return nil, err
	}
	s := newScene()
	for _, e := range elements {
		s.elements[e.id] = storedElement{raw: e.raw, version: e.version, versionNonce: e.versionNonce, isDeleted: e.isDeleted, fingerprint: e.fingerprint}
		s.rawBytes += len(e.raw)
	}
	if messageSize(len(s.elements), s.rawBytes) > hardLimit {
		return nil, fmt.Errorf("stored board exceeds size limit")
	}
	return s, nil
}

func persistenceError() *protocolError {
	return &protocolError{code: "persistence_unavailable", message: "Saving is unavailable; new changes are temporarily rejected"}
}

func (h *Hub) persistRoom(id string, r *Room) {
	defer h.workers.Done()
	p := r.persistence
	ctx, cancel := context.WithTimeout(h.workerCtx, h.persistenceConfig.DBTimeout)
	saved, err := h.store.LoadBoard(ctx, id)
	cancel()
	if errors.Is(err, store.ErrNotFound) {
		saved = store.Snapshot{Elements: json.RawMessage(`[]`)}
		err = nil
	}
	if err == nil {
		r.scene, err = hydrate(saved.Elements)
	}
	h.mu.Lock()
	p.loadErr = err
	p.sequence = saved.ThroughSequence
	close(p.ready)
	if err != nil && p.reservations == 0 {
		delete(h.rooms, id)
	}
	h.mu.Unlock()
	if err != nil {
		return
	}
	ticker := time.NewTicker(h.persistenceConfig.FlushInterval)
	defer ticker.Stop()
	checkpointAt := time.Now().Add(h.persistenceConfig.CheckpointInterval)
	checkpointSequence := int64(0)
	var retryAt time.Time
	var inflight []json.RawMessage
	for {
		select {
		case <-h.workerCtx.Done():
			return
		case <-ticker.C:
		case <-p.wake:
		}
		h.mu.Lock()
		r.mu.Lock()
		idle := len(r.clients) == 0 && p.reservations == 0
		closing := p.closing
		if inflight == nil && len(p.pending) > 0 {
			inflight = append([]json.RawMessage(nil), p.pending...)
		}
		terminal := p.terminal
		r.mu.Unlock()
		h.mu.Unlock()
		if terminal {
			continue
		}
		if !retryAt.IsZero() && time.Now().Before(retryAt) {
			continue
		}
		if len(inflight) > 0 {
			ctx, cancel := context.WithTimeout(h.workerCtx, h.persistenceConfig.DBTimeout)
			sequence, err := h.store.AppendOperations(ctx, id, p.sequence, inflight)
			cancel()
			r.mu.Lock()
			if err != nil {
				if !p.paused {
					r.broadcastLocked(nil, errorMessage(persistenceError(), ""))
				}
				p.paused = true
				p.terminal = errors.Is(err, store.ErrSequenceConflict)
				r.mu.Unlock()
				slog.Warn("board flush failed", "board", id, "sequence_conflict", p.terminal)
				retryAt = time.Now().Add(h.persistenceConfig.RetryInterval)
				continue
			}
			p.sequence = sequence
			for _, raw := range inflight {
				p.pendingBytes -= len(raw)
			}
			clear(p.pending[:len(inflight)])
			p.pending = p.pending[len(inflight):]
			inflight = nil
			retryAt = time.Time{}
			if len(p.pending) == 0 {
				p.pending = nil
				p.paused = false
			}
			r.mu.Unlock()
		}
		checkpointAttempted := false
		if (idle || closing || !time.Now().Before(checkpointAt)) && p.sequence > checkpointSequence {
			ctx, cancel := context.WithTimeout(h.workerCtx, h.persistenceConfig.DBTimeout)
			checkpointAttempted = true
			checkpoint, err := h.store.Checkpoint(ctx, id)
			cancel()
			if err == nil {
				checkpointSequence = checkpoint.ThroughSequence
			} else {
				slog.Warn("board checkpoint failed", "board", id)
			}
			checkpointAt = time.Now().Add(h.persistenceConfig.CheckpointInterval)
		}
		h.mu.Lock()
		r.mu.Lock()
		finished := len(p.pending) == 0 && (p.closing || (len(r.clients) == 0 && p.reservations == 0))
		if finished && p.sequence > checkpointSequence && !checkpointAttempted {
			finished = false
			r.signalPersistence()
		}
		if finished && h.rooms[id] == r {
			delete(h.rooms, id)
		}
		r.mu.Unlock()
		h.mu.Unlock()
		if finished {
			return
		}
	}
}

// Shutdown stops admission, closes clients, and drains room workers before the
// caller closes the database pool. It is safe to call repeatedly.
func (h *Hub) Shutdown(ctx context.Context) error {
	h.mu.Lock()
	h.closing = true
	for _, r := range h.rooms {
		r.mu.Lock()
		for _, c := range r.clients {
			c.cancel()
		}
		if r.persistence != nil {
			r.persistence.closing = true
			r.signalPersistence()
		}
		r.mu.Unlock()
	}
	h.mu.Unlock()
	done := make(chan struct{})
	go func() { h.workers.Wait(); h.clients.Wait(); close(done) }()
	select {
	case <-done:
		if h.cancelWorkers != nil {
			h.cancelWorkers()
		}
		return nil
	case <-ctx.Done():
		if h.cancelWorkers != nil {
			h.cancelWorkers()
		}
		h.mu.Lock()
		for id, r := range h.rooms {
			r.mu.Lock()
			if r.persistence != nil {
				slog.Error("unsaved board on shutdown", "board", id, "batches", len(r.persistence.pending))
			}
			r.mu.Unlock()
		}
		h.mu.Unlock()
		<-done
		return ctx.Err()
	}
}
