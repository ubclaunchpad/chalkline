package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
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
		{"leave for another client", fmt.Sprintf(`{"type":"leave","clientId":%q}`, bobID)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			send(t, alice, message{kind: websocket.MessageText, data: []byte(tt.body)})
			got := receive(t, alice)
			var reply struct{ Type, Message string }
			if err := json.Unmarshal(got.data, &reply); err != nil {
				t.Fatal(err)
			}
			if reply.Type != "error" || reply.Message != "message type must be change or cursor" {
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
			conn, id, _, err := dial(ctx, url+"a")
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
	// The probe's join is now the last membership change. Because each client
	// receives changes in room order, its first roster with the probe is final.
	probe, probeID, probeRoster, err := dial(ctx, url+"a")
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
