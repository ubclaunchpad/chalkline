package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestBrowserCannotSendLifecycleMessages(t *testing.T) {
	hub, url, _ := startServer(t)
	alice, aliceID := connect(t, url+"a")
	bob, bobID := connect(t, url+"a")
	expectParticipants(t, alice, aliceID, bobID)
	for _, tt := range []struct{ name, body string }{
		{"participants", `{"type":"participants","clientIds":["c_mallory"]}`},
		{"empty participants", `{"type":"participants","clientIds":[]}`},
		{"welcome", `{"type":"welcome","clientId":"c_mallory"}`},
		{"snapshot", `{"type":"snapshot","elements":[]}`},
		{"leave for another client", fmt.Sprintf(`{"type":"leave","clientId":%q}`, bobID)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			send(t, alice, message{kind: websocket.MessageText, data: []byte(tt.body)})
			got := receive(t, alice)
			var reply struct{ Type, Code, Message string }
			if err := json.Unmarshal(got.data, &reply); err != nil {
				t.Fatal(err)
			}
			if reply.Type != "error" || reply.Code != codeInvalidMessage ||
				reply.Message != "message type must be change or cursor" {
				t.Fatalf("unexpected reply: %s", got.data)
			}
			// Bob's next message must be this change: no leave or roster came first.
			send(t, alice, changeMessage("after "+tt.name))
			if marker, _ := receiveChange(t, bob); marker != "after "+tt.name {
				t.Fatalf("unexpected relay: %q", marker)
			}
			if members := roomMembers(hub, "a"); !sameSet(members, []string{aliceID, bobID}) {
				t.Fatalf("membership changed to %v", members)
			}
		})
	}
}

func TestLifecycleMessagesStayWithinBoard(t *testing.T) {
	_, url, _ := startServer(t)
	alice, aliceID := connect(t, url+"a")
	dan, danID := connect(t, url+"b")
	erin, erinID := connect(t, url+"b")
	expectParticipants(t, dan, danID, erinID)

	bob, bobID := connect(t, url+"a")
	expectParticipants(t, alice, aliceID, bobID)
	_ = bob.CloseNow()
	expectLeave(t, alice, bobID)
	expectParticipants(t, alice, aliceID)

	// Board a's join and departure are finished. Dan's next message must be
	// Erin's change, not any of board a's lifecycle messages.
	send(t, erin, changeMessage("board-b-only"))
	if marker, from := receiveChange(t, dan); marker != "board-b-only" || from != erinID {
		t.Fatalf("unexpected message on board b: %q from %q", marker, from)
	}
}

func TestRosterSettlesAfterConcurrentJoinsAndLeaves(t *testing.T) {
	hub, url, _ := startServer(t)
	alice, aliceID := connect(t, url+"a")

	const stayers, leavers = 6, 6
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	type joined struct {
		conn *websocket.Conn // nil once the client has left
		id   string
		err  error
	}
	results := make(chan joined, stayers+leavers)
	for i := range stayers + leavers {
		go func() {
			conn, id, _, _, err := dial(ctx, url+"a")
			if err == nil && i >= stayers {
				// dial returns after this client's roster, so the server
				// always handles this departure after its own join.
				_ = conn.CloseNow()
				conn = nil
			}
			results <- joined{conn, id, err}
		}()
	}
	want := []string{aliceID}
	stayed := []*websocket.Conn{alice}
	for range stayers + leavers {
		r := <-results
		if r.err != nil {
			t.Fatal(r.err)
		}
		if r.conn != nil {
			t.Cleanup(func() { _ = r.conn.CloseNow() })
			stayed = append(stayed, r.conn)
			want = append(want, r.id)
		}
	}

	// Every join is confirmed, so the room reaches the expected membership only
	// after every departure has also been handled.
	waitForMembers(t, hub, "a", want)
	// The probe's join is now the last membership change. Rosters are stored
	// in room order and a waiting one is replaced by newer ones, so any roster
	// that includes the probe is final.
	probe, probeID, _, probeRoster, err := dial(ctx, url+"a")
	if err != nil {
		t.Fatal(err)
	}
	defer probe.CloseNow()
	want = append(want, probeID)
	if !sameSet(probeRoster, want) {
		t.Fatalf("probe roster = %v, want %v", probeRoster, want)
	}
	for _, conn := range stayed {
		if got := rosterIncluding(t, conn, probeID); !sameSet(got, want) {
			t.Fatalf("final roster = %v, want %v", got, want)
		}
	}
	if members := roomMembers(hub, "a"); !sameSet(members, want) {
		t.Fatalf("server membership = %v, want %v", members, want)
	}
}

func waitForMembers(t *testing.T, hub *Hub, boardID string, want []string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if sameSet(roomMembers(hub, boardID), want) {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("membership = %v, want %v", roomMembers(hub, boardID), want)
}

// rosterIncluding skips earlier lifecycle messages and returns the first roster
// that includes id. Any other message type fails the test.
func rosterIncluding(t *testing.T, conn *websocket.Conn, id string) []string {
	t.Helper()
	for {
		msg := receive(t, conn)
		var lifecycle struct{ Type string }
		if err := json.Unmarshal(msg.data, &lifecycle); err != nil {
			t.Fatal(err)
		}
		switch lifecycle.Type {
		case "leave":
		case "participants":
			roster, err := parseParticipants(msg.data)
			if err != nil {
				t.Fatal(err)
			}
			if slices.Contains(roster, id) {
				return roster
			}
		default:
			t.Fatalf("unexpected message during membership changes: %s", msg.data)
		}
	}
}

// Alan's report: when many clients left at once, each departure queued a leave
// and a roster for everyone remaining, overflowing healthy clients' queues.
func TestBurstOfDeparturesKeepsHealthyClients(t *testing.T) {
	const total, leavers = 50, 40 // Two messages per departure would need 80 slots.
	hub := NewHub()
	clients := make([]*Client, total)
	cancelled := make([]atomic.Bool, total)
	var room *Room
	for i := range total {
		clients[i] = newClient(fmt.Sprintf("c_%02d", i), nil, func() { cancelled[i].Store(true) })
		room = hub.join("a", clients[i])
	}
	for _, client := range clients[:leavers] {
		hub.leave("a", room, client)
	}
	stayers := clients[leavers:]
	var want []string
	for _, client := range stayers {
		want = append(want, client.id)
	}
	for i, client := range stayers {
		if cancelled[leavers+i].Load() {
			t.Fatalf("%s was disconnected by the burst", client.id)
		}
		// Each stayer holds its snapshot, one roster marker queued at its first
		// pending roster, and one leave per departure.
		if got := len(client.outgoing); got != 2+leavers {
			t.Fatalf("%s has %d queued messages, want %d", client.id, got, 2+leavers)
		}
		if snapshot := queued(t, client); !strings.HasPrefix(string(snapshot.data), snapshotPrefix) {
			t.Fatalf("%s expected its snapshot first, got %s", client.id, snapshot.data)
		}
		// The marker resolves to the newest roster, which overtakes the leaves.
		roster, err := parseParticipants(queued(t, client).data)
		if err != nil || !sameSet(roster, want) {
			t.Fatalf("%s roster = %v (%v), want %v", client.id, roster, err, want)
		}
		for _, left := range clients[:leavers] {
			if got := queued(t, client); string(got.data) != string(lifecycleMessage("leave", left.id).data) {
				t.Fatalf("%s expected leave for %s, got %s", client.id, left.id, got.data)
			}
		}
	}
}

func TestRosterMarkerAlwaysDeliversNewestRoster(t *testing.T) {
	r1 := participantsMessage([]string{"c_1"})
	r2 := participantsMessage([]string{"c_1", "c_2"})

	t.Run("updates while a marker waits share it", func(t *testing.T) {
		client := newClient("c_1", nil, func() { t.Error("unexpected cancel") })
		client.enqueueRoster(r1)
		client.enqueueRoster(r2)
		if len(client.outgoing) != 1 {
			t.Fatalf("queued %d markers, want 1", len(client.outgoing))
		}
		if got := queued(t, client); string(got.data) != string(r2.data) {
			t.Fatalf("sent %s, want the newest roster", got.data)
		}
	})

	// The writer clears the pending flag in the same step as reading the slot.
	// A roster stored after that read must queue a new marker, or it is lost.
	t.Run("an update after the writer reads queues a new marker", func(t *testing.T) {
		client := newClient("c_1", nil, func() { t.Error("unexpected cancel") })
		client.enqueueRoster(r1)
		if got := queued(t, client); string(got.data) != string(r1.data) {
			t.Fatalf("sent %s, want r1", got.data)
		}
		client.enqueueRoster(r2)
		if got := queued(t, client); string(got.data) != string(r2.data) {
			t.Fatalf("sent %s, want r2", got.data)
		}
	})

	t.Run("concurrent writer ends on the newest roster", func(t *testing.T) {
		const updates = 2000
		client := newClient("c_1", nil, func() { t.Error("queue overflowed") })
		done := make(chan struct{})
		last := make(chan message)
		go func() {
			var sent message
			for {
				select {
				case msg := <-client.outgoing:
					sent = client.resolve(msg)
				case <-done:
					for len(client.outgoing) > 0 {
						sent = client.resolve(<-client.outgoing)
					}
					last <- sent
					return
				}
			}
		}()
		var newest message
		for i := range updates {
			newest = participantsMessage([]string{fmt.Sprintf("c_%d", i)})
			client.enqueueRoster(newest)
		}
		close(done)
		if got := <-last; string(got.data) != string(newest.data) {
			t.Fatalf("writer ended on %s, want %s", got.data, newest.data)
		}
	})
}
