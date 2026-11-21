package realtime

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ubclaunchpad/chalkline/server/internal/store"
)

type memoryPersistence struct {
	mu          sync.Mutex
	scenes      map[string]store.Snapshot
	fail        bool
	calls       chan struct{}
	checkpoints chan struct{}
}

func newMemoryPersistence() *memoryPersistence {
	return &memoryPersistence{scenes: map[string]store.Snapshot{}, calls: make(chan struct{}, 100), checkpoints: make(chan struct{}, 100)}
}
func (m *memoryPersistence) LoadBoard(_ context.Context, id string) (store.Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.scenes[id]
	if !ok {
		return s, store.ErrNotFound
	}
	return s, nil
}
func (m *memoryPersistence) AppendOperations(_ context.Context, id string, seq int64, batches []json.RawMessage) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	defer func() { m.calls <- struct{}{} }()
	if m.fail {
		return 0, errors.New("database down")
	}
	s, ok := m.scenes[id]
	if !ok {
		s = store.Snapshot{Elements: json.RawMessage(`[]`)}
	}
	if s.ThroughSequence != seq {
		return 0, store.ErrSequenceConflict
	}
	ops := make([]store.Operation, len(batches))
	for i, raw := range batches {
		ops[i] = store.Operation{Sequence: seq + int64(i) + 1, Elements: raw}
	}
	next, err := store.RebuildSnapshot(s, ops)
	if err != nil {
		return 0, err
	}
	m.scenes[id] = next
	return next.ThroughSequence, nil
}
func (m *memoryPersistence) Checkpoint(ctx context.Context, id string) (store.Snapshot, error) {
	defer func() { m.checkpoints <- struct{}{} }()
	return m.LoadBoard(ctx, id)
}

func persistentServer(t *testing.T, s PersistenceStore, cfg PersistenceConfig) (*Hub, string) {
	t.Helper()
	h, err := NewPersistentHub(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := h.Shutdown(ctx); err != nil {
			t.Error(err)
		}
		server.Close()
	})
	return h, "ws" + strings.TrimPrefix(server.URL, "http") + "/?board="
}
func awaitCall(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for persistence")
	}
}
func editMessage(version int) message {
	return message{kind: websocket.MessageText, data: []byte(fmtEdit(version))}
}
func fmtEdit(version int) string {
	raw, _ := json.Marshal(map[string]any{"type": "change", "elements": []any{map[string]any{"id": "a", "version": version, "versionNonce": 0, "isDeleted": version > 1, "customData": map[string]any{"kind": "database"}, "startBinding": map[string]any{"elementId": "b"}}}})
	return string(raw)
}

func TestRoomFlushAndLastDeparture(t *testing.T) {
	m := newMemoryPersistence()
	cfg := DefaultPersistenceConfig()
	cfg.FlushInterval = time.Hour
	cfg.CheckpointInterval = time.Hour
	h, url := persistentServer(t, m, cfg)
	alice, _ := connect(t, url+"a")
	bob, _ := connect(t, url+"a")
	send(t, alice, editMessage(1))
	receive(t, bob)
	select {
	case <-m.calls:
		t.Fatal("flushed before cadence or departure")
	default:
	}
	_ = alice.CloseNow()
	_ = bob.CloseNow()
	awaitCall(t, m.calls)
	awaitCall(t, m.checkpoints)
	waitForEmptyHub(t, h)
	_, _, elements := joinBoard(t, url+"a")
	if len(elements) != 1 {
		t.Fatalf("restored elements=%d", len(elements))
	}
}

func TestRoomFailurePausesAndRetries(t *testing.T) {
	m := newMemoryPersistence()
	m.fail = true
	cfg := DefaultPersistenceConfig()
	cfg.FlushInterval = 10 * time.Millisecond
	cfg.RetryInterval = 20 * time.Millisecond
	_, url := persistentServer(t, m, cfg)
	alice, _ := connect(t, url+"a")
	bob, _ := connect(t, url+"a")
	send(t, alice, editMessage(1))
	receive(t, bob)
	awaitCall(t, m.calls)
	if msg := receive(t, alice); !strings.Contains(string(msg.data), "persistence_unavailable") {
		t.Fatalf("no saving error: %s", msg.data)
	}
	send(t, alice, editMessage(2))
	if msg := receive(t, alice); !strings.Contains(string(msg.data), "persistence_unavailable") {
		t.Fatal("accepted while paused")
	}
	m.mu.Lock()
	m.fail = false
	m.mu.Unlock()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case <-m.calls:
			s, err := m.LoadBoard(t.Context(), "a")
			if err == nil {
				if s.ThroughSequence != 1 {
					t.Fatal("rejected edit was logged")
				}
				return
			}
		case <-deadline:
			t.Fatal("did not recover")
		}
	}
}

func TestBufferLimitRejectsBeforeMutation(t *testing.T) {
	m := newMemoryPersistence()
	cfg := DefaultPersistenceConfig()
	cfg.FlushInterval = time.Hour
	cfg.MaxPendingBatches = 1
	_, url := persistentServer(t, m, cfg)
	a, _ := connect(t, url+"a")
	b, _ := connect(t, url+"a")
	send(t, a, editMessage(1))
	receive(t, b)
	send(t, a, editMessage(2))
	if msg := receive(t, a); !strings.Contains(string(msg.data), "persistence_unavailable") {
		t.Fatal("missing backpressure error")
	}
	awaitCall(t, m.calls)
	_, _, snapshot := joinBoard(t, url+"a")
	if len(snapshot) != 1 || strings.Contains(string(snapshot[0]), `"isDeleted":true`) {
		t.Fatal("rejected edit changed scene")
	}
}

func TestPostgresWebSocketRecovery(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL required")
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	s := store.NewPostgres(pool)
	cfg := DefaultPersistenceConfig()
	cfg.FlushInterval = time.Hour
	h, ws := persistentServer(t, s, cfg)
	board := "recovery-" + rand.Text()
	a, _ := connect(t, ws+board)
	b, _ := connect(t, ws+board)
	send(t, a, editMessage(1))
	receive(t, b)
	send(t, a, editMessage(2))
	receive(t, b)
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	_, ws2 := persistentServer(t, s, cfg)
	_, _, elements := joinBoard(t, ws2+board)
	if len(elements) != 1 || !strings.Contains(string(elements[0]), `"isDeleted":true`) || !strings.Contains(string(elements[0]), `"startBinding"`) {
		t.Fatalf("bad recovery: %s", elements)
	}
	_, _, other := joinBoard(t, ws2+board+"x")
	if len(other) != 0 {
		t.Fatal("cross-board leak")
	}
}

func TestHydrateRetainsHeadroomAndFingerprints(t *testing.T) {
	raw := `[{"id":"a","version":1,"versionNonce":0,"isDeleted":false,"label":"` + strings.Repeat("x", newElementLimit) + `"}]`
	s, err := hydrate(json.RawMessage(raw))
	if err != nil {
		t.Fatal(err)
	}
	incoming, perr := parseElements(json.RawMessage(raw))
	if perr != nil {
		t.Fatal(perr)
	}
	winners, _, perr := s.apply(incoming)
	if perr != nil || len(winners) != 0 {
		t.Fatal("round-trip changed fingerprint")
	}
}

func TestPersistenceCadence(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		m := newMemoryPersistence()
		h, err := NewPersistentHub(m, DefaultPersistenceConfig())
		if err != nil {
			t.Fatal(err)
		}
		r, err := h.reserve(t.Context(), "a")
		if err != nil {
			t.Fatal(err)
		}
		c := newClient("a", nil, func() {})
		h.join("a", c)
		p, perr := prepareMessage(editMessage(1).data, c.id)
		if perr != nil {
			t.Fatal(perr)
		}
		r.applyChange(c, p)
		time.Sleep(249 * time.Millisecond)
		synctest.Wait()
		select {
		case <-m.calls:
			t.Fatal("flushed early")
		default:
		}
		time.Sleep(time.Millisecond)
		synctest.Wait()
		awaitCall(t, m.calls)
		select {
		case <-m.checkpoints:
			t.Fatal("checkpointed early")
		default:
		}
		time.Sleep(29750 * time.Millisecond)
		synctest.Wait()
		awaitCall(t, m.checkpoints)
		time.Sleep(30 * time.Second)
		synctest.Wait()
		select {
		case <-m.checkpoints:
			t.Fatal("checkpointed clean board")
		default:
		}
		h.leave("a", r, c)
		h.releaseReservation("a", r)
		if err := h.Shutdown(t.Context()); err != nil {
			t.Fatal(err)
		}
	})
}

type lostCommitStore struct {
	PersistenceStore
	lost atomic.Bool
}

func (s *lostCommitStore) AppendOperations(ctx context.Context, id string, seq int64, b []json.RawMessage) (int64, error) {
	end, err := s.PersistenceStore.AppendOperations(ctx, id, seq, b)
	if err == nil && s.lost.CompareAndSwap(false, true) {
		return 0, errors.New("commit response lost")
	}
	return end, err
}
func TestLostCommitResponseRecovery(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL required")
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	s := &lostCommitStore{PersistenceStore: store.NewPostgres(pool)}
	cfg := DefaultPersistenceConfig()
	cfg.FlushInterval = 10 * time.Millisecond
	cfg.RetryInterval = 10 * time.Millisecond
	h, ws := persistentServer(t, s, cfg)
	board := "lost-" + rand.Text()
	a, _ := connect(t, ws+board)
	b, _ := connect(t, ws+board)
	send(t, a, editMessage(1))
	receive(t, b)
	if msg := receive(t, a); !strings.Contains(string(msg.data), "persistence_unavailable") {
		t.Fatal("missing failure")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	saved, err := s.LoadBoard(t.Context(), board)
	if err != nil || saved.ThroughSequence != 1 {
		t.Fatalf("retry duplicated or lost edit: %+v %v", saved, err)
	}
}

func TestTransientMessagesAndLoadFailure(t *testing.T) {
	m := newMemoryPersistence()
	h, ws := persistentServer(t, m, DefaultPersistenceConfig())
	a, _ := connect(t, ws+"a")
	b, _ := connect(t, ws+"a")
	send(t, a, message{kind: websocket.MessageText, data: []byte(`{"type":"cursor","x":1,"y":2}`)})
	receive(t, b)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case <-m.calls:
		t.Fatal("presence was persisted")
	default:
	}
	m.scenes["bad"] = store.Snapshot{Elements: json.RawMessage(`[null]`)}
	_, ws = persistentServer(t, m, DefaultPersistenceConfig())
	c, response, err := websocket.Dial(t.Context(), ws+"bad", nil)
	if c != nil {
		c.CloseNow()
	}
	if err == nil || response == nil || response.StatusCode != 503 {
		t.Fatalf("invalid history did not reject join: %v", err)
	}
}

func TestShutdownTimeoutRetainsUncommittedWork(t *testing.T) {
	m := newMemoryPersistence()
	m.fail = true
	h, err := NewPersistentHub(m, DefaultPersistenceConfig())
	if err != nil {
		t.Fatal(err)
	}
	r, err := h.reserve(t.Context(), "a")
	if err != nil {
		t.Fatal(err)
	}
	c := newClient("a", nil, func() {})
	h.join("a", c)
	p, perr := prepareMessage(editMessage(1).data, c.id)
	if perr != nil {
		t.Fatal(perr)
	}
	r.applyChange(c, p)
	h.leave("a", r, c)
	h.releaseReservation("a", r)
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Millisecond)
	defer cancel()
	if err := h.Shutdown(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("shutdown error=%v", err)
	}
	r.mu.Lock()
	pending := len(r.persistence.pending)
	r.mu.Unlock()
	if pending != 1 {
		t.Fatal("shutdown dropped unsaved work")
	}
	if _, err := h.reserve(t.Context(), "b"); err == nil {
		t.Fatal("join admitted after shutdown")
	}
}

type gatedLoadStore struct {
	PersistenceStore
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (s *gatedLoadStore) LoadBoard(ctx context.Context, id string) (store.Snapshot, error) {
	s.once.Do(func() { close(s.entered) })
	select {
	case <-s.release:
		return s.PersistenceStore.LoadBoard(ctx, id)
	case <-ctx.Done():
		return store.Snapshot{}, ctx.Err()
	}
}
func TestConcurrentJoinsShareLoadingRoom(t *testing.T) {
	m := newMemoryPersistence()
	s := &gatedLoadStore{PersistenceStore: m, entered: make(chan struct{}), release: make(chan struct{})}
	h, err := NewPersistentHub(s, DefaultPersistenceConfig())
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan *Room, 2)
	for range 2 {
		go func() {
			r, err := h.reserve(t.Context(), "a")
			if err != nil {
				t.Error(err)
			}
			results <- r
		}()
	}
	<-s.entered
	close(s.release)
	a, b := <-results, <-results
	if a != b || a == nil {
		t.Fatal("joins used different rooms")
	}
	h.releaseReservation("a", a)
	h.releaseReservation("a", b)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
}

type gatedAppendStore struct {
	PersistenceStore
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (s *gatedAppendStore) AppendOperations(ctx context.Context, id string, seq int64, b []json.RawMessage) (int64, error) {
	block := false
	s.once.Do(func() { block = true; close(s.entered) })
	if block {
		select {
		case <-s.release:
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	return s.PersistenceStore.AppendOperations(ctx, id, seq, b)
}
func TestEditsDuringFlushRemainQueued(t *testing.T) {
	m := newMemoryPersistence()
	s := &gatedAppendStore{PersistenceStore: m, entered: make(chan struct{}), release: make(chan struct{})}
	cfg := DefaultPersistenceConfig()
	cfg.FlushInterval = 10 * time.Millisecond
	h, ws := persistentServer(t, s, cfg)
	a, _ := connect(t, ws+"a")
	b, _ := connect(t, ws+"a")
	send(t, a, editMessage(1))
	receive(t, b)
	awaitCall(t, s.entered)
	send(t, a, editMessage(2))
	receive(t, b)
	close(s.release)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if err := h.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	saved, err := m.LoadBoard(t.Context(), "a")
	if err != nil || saved.ThroughSequence != 2 {
		t.Fatalf("lost edit during flush: %+v %v", saved, err)
	}
}
