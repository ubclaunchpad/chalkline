package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func startServer(t *testing.T) (*Hub, string, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	hub := NewHub()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", hub.HandleWebSocket)
	server := httptest.NewUnstartedServer(mux)
	server.Config.BaseContext = func(net.Listener) context.Context { return ctx }
	server.Start()
	t.Cleanup(func() {
		cancel()
		server.Close()
		waitForEmptyHub(t, hub)
	})
	return hub, "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?board=", cancel
}

func connect(t *testing.T, url string) (*websocket.Conn, string) {
	t.Helper()
	conn, id, _ := joinBoard(t, url)
	return conn, id
}

// joinBoard connects and checks the join sequence: welcome, then exactly one
// snapshot. It returns the snapshot's elements.
func joinBoard(t *testing.T, url string) (*websocket.Conn, string, []json.RawMessage) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	// The library's default read limit is 32 KiB. Snapshots can reach 1 MiB,
	// and a forwarded change can be slightly larger once "from" is added.
	conn.SetReadLimit(2 << 20)
	msg := receive(t, conn)
	var welcome struct {
		Type     string `json:"type"`
		ClientID string `json:"clientId"`
	}
	if err := json.Unmarshal(msg.data, &welcome); err != nil {
		t.Fatal(err)
	}
	if msg.kind != websocket.MessageText || welcome.Type != "welcome" || welcome.ClientID == "" {
		t.Fatalf("first message is not a welcome: %s", msg.data)
	}
	msg = receive(t, conn)
	var snapshot struct {
		Type     string            `json:"type"`
		Elements []json.RawMessage `json:"elements"`
	}
	if err := json.Unmarshal(msg.data, &snapshot); err != nil || snapshot.Type != "snapshot" || snapshot.Elements == nil {
		t.Fatalf("second message is not a snapshot: %s", msg.data)
	}
	return conn, welcome.ClientID, snapshot.Elements
}

func receive(t *testing.T, conn *websocket.Conn) message {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	kind, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return message{kind: kind, data: data}
}

func send(t *testing.T, conn *websocket.Conn, msg message) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	if err := conn.Write(ctx, msg.kind, msg.data); err != nil {
		t.Fatal(err)
	}
}

var nextElement atomic.Int64

// changeMessage sends a brand-new element carrying marker. A new element ID
// always wins, so the room forwards it, even when the same marker is reused.
func changeMessage(marker string) message {
	return elementChange(fmt.Sprintf("e%d", nextElement.Add(1)), 1, 1, false, marker, "")
}

// elementChange sends one element. marker sits inside the element, so it is
// part of the element's content.
func elementChange(id string, version, nonce int64, deleted bool, marker, batchID string) message {
	change := map[string]any{"type": "change", "elements": []any{map[string]any{
		"id": id, "version": version, "versionNonce": nonce, "isDeleted": deleted, "marker": marker,
	}}}
	if batchID != "" {
		change["batchId"] = batchID
	}
	data, _ := json.Marshal(change)
	return message{kind: websocket.MessageText, data: data}
}

// receiveChange returns the marker of the first element in the next message,
// which must be an attributed change.
func receiveChange(t *testing.T, conn *websocket.Conn) (string, string) {
	t.Helper()
	msg := receive(t, conn)
	var change struct {
		Type     string `json:"type"`
		From     string `json:"from"`
		Elements []struct {
			Marker string `json:"marker"`
		} `json:"elements"`
	}
	if err := json.Unmarshal(msg.data, &change); err != nil {
		t.Fatal(err)
	}
	if msg.kind != websocket.MessageText || change.Type != "change" || change.From == "" || len(change.Elements) == 0 {
		t.Fatalf("expected attributed change, got %s", msg.data)
	}
	return change.Elements[0].Marker, change.From
}

func waitForEmptyHub(t *testing.T, hub *Hub) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		hub.mu.Lock()
		empty := len(hub.rooms) == 0
		hub.mu.Unlock()
		if empty {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("rooms were not cleaned up")
}

func TestConcurrentRelay(t *testing.T) {
	_, url, _ := startServer(t)
	var clients []*websocket.Conn
	var clientIDs []string
	ids := make(map[string]bool)
	for range 3 {
		conn, id := connect(t, url+"a")
		if ids[id] {
			t.Fatalf("duplicate client ID %q", id)
		}
		ids[id] = true
		clients = append(clients, conn)
		clientIDs = append(clientIDs, id)
	}
	outsider, _ := connect(t, url+"b")
	partner, _ := connect(t, url+"b")

	// All three participants send concurrently. Their readers below must each
	// receive exactly the other two participants' messages, never their own.
	const count = 8
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	errors := make(chan error, len(clients))
	for i, conn := range clients {
		go func() {
			for n := range count {
				data := changeMessage(fmt.Sprintf("%d:%d", i, n)).data
				if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
					errors <- err
					return
				}
			}
			errors <- nil
		}()
	}
	for i, conn := range clients {
		want := make(map[string]string)
		for sender := range clients {
			if sender != i {
				for n := range count {
					want[fmt.Sprintf("%d:%d", sender, n)] = clientIDs[sender]
				}
			}
		}
		for range 2 * count {
			marker, from := receiveChange(t, conn)
			if want[marker] != from {
				t.Fatalf("client %d received unexpected message %q from %q", i, marker, from)
			}
			delete(want, marker)
		}
	}
	for range clients {
		if err := <-errors; err != nil {
			t.Fatal(err)
		}
	}

	// All board-a broadcasts finished before this marker. Board b must receive
	// only its own traffic, rather than any earlier board-a messages.
	marker := changeMessage("board-b-only")
	send(t, partner, marker)
	if got, _ := receiveChange(t, outsider); got != "board-b-only" {
		t.Fatalf("cross-room message: %q", got)
	}
}

func TestDisconnectAndRejoin(t *testing.T) {
	hub, url, _ := startServer(t)
	alice, aliceID := connect(t, url+"a")
	bob, _ := connect(t, url+"a")
	_ = alice.CloseNow() // Abrupt tab/network loss, without a close handshake.
	leave := receive(t, bob)
	if string(leave.data) != string(lifecycleMessage("leave", aliceID).data) {
		t.Fatalf("unexpected leave message: %s", leave.data)
	}
	carol, _ := connect(t, url+"a")
	send(t, carol, changeMessage("still working"))
	if got, _ := receiveChange(t, bob); got != "still working" {
		t.Fatalf("room stopped working or sent duplicate leave: %q", got)
	}
	_ = bob.CloseNow()
	_ = carol.CloseNow()
	waitForEmptyHub(t, hub)
	_, newID := connect(t, url+"a")
	if newID == aliceID {
		t.Fatal("reconnect reused the old connection ID")
	}
}

func TestServerCancellationStopsIdleClients(t *testing.T) {
	hub, url, cancel := startServer(t)
	conn, _ := connect(t, url+"a")
	cancel()
	ctx, stop := context.WithTimeout(t.Context(), 5*time.Second)
	defer stop()
	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("connection remained open after server cancellation")
	}
	if ctx.Err() != nil {
		t.Fatal("connection did not close before the test deadline")
	}
	waitForEmptyHub(t, hub)
}

func TestFullQueueCancelsOnlySlowClient(t *testing.T) {
	hub := NewHub()
	slowCtx, cancelSlow := context.WithCancel(t.Context())
	defer cancelSlow()
	healthyCtx, cancelHealthy := context.WithCancel(t.Context())
	defer cancelHealthy()
	senderCtx, cancelSender := context.WithCancel(t.Context())
	defer cancelSender()
	slow := newClient("slow", nil, cancelSlow)
	healthy := newClient("healthy", nil, cancelHealthy)
	sender := newClient("sender", nil, cancelSender)
	room := hub.join("a", slow)
	hub.join("a", healthy)
	hub.join("a", sender)
	msg := message{kind: websocket.MessageText, data: []byte("hello")}
	for range outgoingCapacity - 1 { // join already queued a snapshot.
		slow.enqueue(msg)
	}
	room.broadcast(sender, msg)
	if slowCtx.Err() == nil || healthyCtx.Err() != nil || senderCtx.Err() != nil {
		t.Fatal("only the slow client should be cancelled")
	}
	if snapshot := <-healthy.outgoing; !strings.HasPrefix(string(snapshot.data), snapshotPrefix) {
		t.Fatalf("expected the join snapshot first, got %q", snapshot.data)
	}
	select {
	case got := <-healthy.outgoing:
		if string(got.data) != "hello" {
			t.Fatalf("unexpected message: %q", got.data)
		}
	default:
		t.Fatal("healthy client did not receive the broadcast")
	}
	if len(sender.outgoing) != 1 { // Only its own join snapshot.
		t.Fatal("sender received its own broadcast")
	}
}

func TestConcurrentMembership(t *testing.T) {
	hub := NewHub()
	var wg sync.WaitGroup
	for i := range 32 {
		wg.Go(func() {
			for range 20 {
				ctx, cancel := context.WithCancel(t.Context())
				client := newClient(fmt.Sprint(i), nil, cancel)
				room := hub.join("a", client)
				hub.mu.Lock()
				if hub.rooms["a"] != room {
					t.Error("joined a room that is no longer in the hub")
				}
				hub.mu.Unlock()
				room.broadcast(client, message{kind: websocket.MessageText, data: []byte("hello")})
				hub.leave("a", room, client)
				cancel()
				<-ctx.Done()
			}
		})
	}
	wg.Wait()
	waitForEmptyHub(t, hub)
}
