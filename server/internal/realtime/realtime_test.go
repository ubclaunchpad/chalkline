package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
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
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	conn, id, _, err := dial(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn, id
}

// dial joins a board and reads its welcome and first roster. It returns errors
// instead of failing the test, so goroutines other than the test's can use it.
func dial(ctx context.Context, url string) (*websocket.Conn, string, []string, error) {
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		return nil, "", nil, err
	}
	id, roster, err := readJoin(ctx, conn)
	if err != nil {
		_ = conn.CloseNow()
		return nil, "", nil, err
	}
	return conn, id, roster, nil
}

func readJoin(ctx context.Context, conn *websocket.Conn) (string, []string, error) {
	kind, data, err := conn.Read(ctx)
	if err != nil {
		return "", nil, err
	}
	var welcome struct {
		Type     string `json:"type"`
		ClientID string `json:"clientId"`
	}
	if kind != websocket.MessageText || json.Unmarshal(data, &welcome) != nil ||
		welcome.Type != "welcome" || welcome.ClientID == "" {
		return "", nil, fmt.Errorf("first message is not a welcome: %s", data)
	}
	// The join queues the newcomer's roster under the room lock, so nothing else
	// can arrive between welcome and this roster.
	if _, data, err = conn.Read(ctx); err != nil {
		return "", nil, err
	}
	roster, err := parseParticipants(data)
	if err != nil {
		return "", nil, err
	}
	if !slices.Contains(roster, welcome.ClientID) {
		return "", nil, fmt.Errorf("newcomer's roster %v does not include itself", roster)
	}
	return welcome.ClientID, roster, nil
}

func parseParticipants(data []byte) ([]string, error) {
	var roster struct {
		Type      string   `json:"type"`
		ClientIDs []string `json:"clientIds"`
	}
	if json.Unmarshal(data, &roster) != nil || roster.Type != "participants" {
		return nil, fmt.Errorf("expected participants, got %s", data)
	}
	return roster.ClientIDs, nil
}

func receiveParticipants(t *testing.T, conn *websocket.Conn) []string {
	t.Helper()
	msg := receive(t, conn)
	roster, err := parseParticipants(msg.data)
	if err != nil || msg.kind != websocket.MessageText {
		t.Fatalf("expected participants, got %s", msg.data)
	}
	return roster
}

// sameSet compares rosters as sets. A duplicate ID makes them differ.
func sameSet(got, want []string) bool {
	return slices.Equal(slices.Sorted(slices.Values(got)), slices.Sorted(slices.Values(want)))
}

func expectParticipants(t *testing.T, conn *websocket.Conn, want ...string) {
	t.Helper()
	if got := receiveParticipants(t, conn); !sameSet(got, want) {
		t.Fatalf("roster = %v, want %v", got, want)
	}
}

func expectLeave(t *testing.T, conn *websocket.Conn, clientID string) {
	t.Helper()
	if msg := receive(t, conn); string(msg.data) != string(lifecycleMessage("leave", clientID).data) {
		t.Fatalf("expected leave for %s, got %s", clientID, msg.data)
	}
}

// roomMembers takes the hub lock, then the room lock, like the server does.
func roomMembers(hub *Hub, boardID string) []string {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	room := hub.rooms[boardID]
	if room == nil {
		return nil
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	return slices.Collect(maps.Keys(room.clients))
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

func changeMessage(marker string) message {
	data, _ := json.Marshal(map[string]any{"type": "change", "elements": []any{}, "marker": marker})
	return message{kind: websocket.MessageText, data: data}
}

func receiveChange(t *testing.T, conn *websocket.Conn) (string, string) {
	t.Helper()
	msg := receive(t, conn)
	var change struct {
		Type   string `json:"type"`
		From   string `json:"from"`
		Marker string `json:"marker"`
	}
	if err := json.Unmarshal(msg.data, &change); err != nil {
		t.Fatal(err)
	}
	if msg.kind != websocket.MessageText || change.Type != "change" || change.From == "" {
		t.Fatalf("expected attributed change, got %s", msg.data)
	}
	return change.Marker, change.From
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

func drain(client *Client) {
	for {
		select {
		case <-client.outgoing:
		default:
			return
		}
	}
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
		// connect checked the newcomer's roster; earlier clients learn of the join.
		for _, earlier := range clients[:len(clients)-1] {
			expectParticipants(t, earlier, clientIDs...)
		}
	}
	outsider, outsiderID := connect(t, url+"b")
	partner, partnerID := connect(t, url+"b")
	expectParticipants(t, outsider, outsiderID, partnerID)

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
	bob, bobID := connect(t, url+"a")
	_ = alice.CloseNow() // Abrupt tab/network loss, without a close handshake.
	leave := receive(t, bob)
	if string(leave.data) != string(lifecycleMessage("leave", aliceID).data) {
		t.Fatalf("unexpected leave message: %s", leave.data)
	}
	expectParticipants(t, bob, bobID)
	carol, carolID := connect(t, url+"a")
	expectParticipants(t, bob, bobID, carolID)
	send(t, carol, changeMessage("still working"))
	if got, _ := receiveChange(t, bob); got != "still working" {
		t.Fatalf("room stopped working or sent duplicate leave: %q", got)
	}
	_ = bob.CloseNow()
	_ = carol.CloseNow()
	waitForEmptyHub(t, hub)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	rejoined, newID, roster, err := dial(ctx, url+"a")
	if err != nil {
		t.Fatal(err)
	}
	defer rejoined.CloseNow()
	if newID == aliceID || !slices.Equal(roster, []string{newID}) {
		t.Fatalf("reconnect got ID %q and roster %v, want a new ID alone", newID, roster)
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
	// Discard join rosters so the slow client overflows only on the broadcast.
	for _, client := range []*Client{slow, healthy, sender} {
		drain(client)
	}
	msg := message{kind: websocket.MessageText, data: []byte("hello")}
	for range outgoingCapacity {
		slow.enqueue(msg)
	}
	room.broadcast(sender, msg)
	if slowCtx.Err() == nil || healthyCtx.Err() != nil || senderCtx.Err() != nil {
		t.Fatal("only the slow client should be cancelled")
	}
	select {
	case got := <-healthy.outgoing:
		if string(got.data) != "hello" {
			t.Fatalf("unexpected message: %q", got.data)
		}
	default:
		t.Fatal("healthy client did not receive the broadcast")
	}
	if len(sender.outgoing) != 0 {
		t.Fatal("sender received its own broadcast")
	}

	// Cancellation ends the slow client's handler, which then calls leave. The
	// others must see it go, and no roster may still list it.
	hub.leave("a", room, slow)
	for _, client := range []*Client{healthy, sender} {
		if got := queued(t, client); string(got.data) != string(lifecycleMessage("leave", "slow").data) {
			t.Fatalf("%s expected leave for slow, got %s", client.id, got.data)
		}
		roster, err := parseParticipants(queued(t, client).data)
		if err != nil || !sameSet(roster, []string{"healthy", "sender"}) {
			t.Fatalf("%s got roster %v (%v), want healthy and sender", client.id, roster, err)
		}
	}
}

// queued returns the next message waiting for an in-memory client.
func queued(t *testing.T, client *Client) message {
	t.Helper()
	select {
	case msg := <-client.outgoing:
		return msg
	default:
		t.Fatalf("%s has no queued message", client.id)
		return message{}
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
