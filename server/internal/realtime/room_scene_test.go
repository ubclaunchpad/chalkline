package realtime

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// Test mechanics. The server never acknowledges an accepted change, so a test
// waits for proof that the room applied it: an observer client reads the
// forwarded change, which is queued under the room lock after the change is
// stored. A rejected or losing change ends with a reply to its sender instead.
// "Receives nothing" is checked with a marker: a fresh change from another
// client must be the next message.

type serverMessage struct {
	Type      string            `json:"type"`
	From      string            `json:"from"`
	Code      string            `json:"code"`
	ElementID string            `json:"elementId"`
	BatchID   string            `json:"batchId"`
	Elements  []json.RawMessage `json:"elements"`
}

func receiveMessage(t *testing.T, conn *websocket.Conn) serverMessage {
	t.Helper()
	msg := receive(t, conn)
	var decoded serverMessage
	if err := json.Unmarshal(msg.data, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

type sceneElement struct {
	ID           string `json:"id"`
	Version      int64  `json:"version"`
	VersionNonce int64  `json:"versionNonce"`
	IsDeleted    bool   `json:"isDeleted"`
	Marker       string `json:"marker"`
}

func decodeElements(t *testing.T, raws []json.RawMessage) map[string]sceneElement {
	t.Helper()
	elements := make(map[string]sceneElement, len(raws))
	for _, raw := range raws {
		var element sceneElement
		if err := json.Unmarshal(raw, &element); err != nil {
			t.Fatal(err)
		}
		elements[element.ID] = element
	}
	return elements
}

func TestLateJoinerGetsSnapshot(t *testing.T) {
	_, url, _ := startServer(t)
	alice, _ := connect(t, url+"a")
	observer, _ := connect(t, url+"a")
	for _, msg := range []message{
		elementChange("x", 1, 1, false, "x1", ""),
		elementChange("y", 1, 1, false, "y1", ""),
		elementChange("y", 2, 1, true, "y deleted", ""),
	} {
		send(t, alice, msg)
		receiveChange(t, observer)
	}
	_, _, snapshot := joinBoard(t, url+"a")
	got := decodeElements(t, snapshot)
	if len(got) != 2 || got["x"].Version != 1 || got["x"].IsDeleted || !got["y"].IsDeleted || got["y"].Version != 2 {
		t.Fatalf("unexpected snapshot: %+v", got)
	}
}

func TestJoinDuringEditsHasNoGap(t *testing.T) {
	_, url, _ := startServer(t)
	alice, _ := connect(t, url+"a")
	const last = 200
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	sent := make(chan error, 1)
	go func() {
		for version := int64(1); version <= last; version++ {
			if err := alice.Write(ctx, websocket.MessageText, elementChange("x", version, 1, false, "", "").data); err != nil {
				sent <- err
				return
			}
		}
		sent <- nil
	}()

	bob, _, snapshot := joinBoard(t, url+"a")
	next := int64(1) // An empty snapshot means Bob joined before the first edit.
	if x, ok := decodeElements(t, snapshot)["x"]; ok {
		next = x.Version + 1
	}
	for version := next; version <= last; version++ {
		msg := receiveMessage(t, bob)
		if x := decodeElements(t, msg.Elements)["x"]; msg.Type != "change" || x.Version != version {
			t.Fatalf("expected version %d after snapshot, got %+v", version, msg)
		}
	}
	if err := <-sent; err != nil {
		t.Fatal(err)
	}
	// Nothing was repeated: a later marker is Bob's next message.
	send(t, alice, changeMessage("done"))
	if marker, _ := receiveChange(t, bob); marker != "done" {
		t.Fatalf("unexpected extra message before marker: %q", marker)
	}
}

func TestConflictingEditsConvergeInEitherOrder(t *testing.T) {
	low := elementChange("x", 2, 100, false, "low", "")
	high := elementChange("x", 2, 900, false, "high", "")
	for _, tt := range []struct {
		name          string
		first, second message
		secondWins    bool
	}{
		{"lower nonce arrives second", high, low, true},
		{"lower nonce arrives first", low, high, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, url, _ := startServer(t)
			sender, _ := connect(t, url+"a")
			observer, _ := connect(t, url+"a")
			send(t, sender, tt.first)
			receiveChange(t, observer)
			send(t, sender, tt.second)
			if tt.secondWins {
				receiveChange(t, observer)
			} else if msg := receiveMessage(t, sender); msg.Type != "change" || msg.From != "server" {
				t.Fatalf("expected a correction, got %+v", msg)
			}
			_, _, snapshot := joinBoard(t, url+"a")
			if x := decodeElements(t, snapshot)["x"]; x.VersionNonce != 100 || x.Marker != "low" {
				t.Fatalf("room kept %+v, want the lower-nonce copy", x)
			}
		})
	}
}

func TestStaleEditIsCorrectedNotForwarded(t *testing.T) {
	_, url, _ := startServer(t)
	alice, _ := connect(t, url+"a")
	bob, bobID := connect(t, url+"a")
	send(t, alice, elementChange("x", 3, 1, false, "current", ""))
	if marker, _ := receiveChange(t, bob); marker != "current" {
		t.Fatalf("unexpected forward: %q", marker)
	}

	send(t, bob, elementChange("x", 2, 1, false, "stale", ""))
	correction := receiveMessage(t, bob)
	x := decodeElements(t, correction.Elements)["x"]
	if correction.Type != "change" || correction.From != "server" || x.Version != 3 || x.Marker != "current" {
		t.Fatalf("expected the stored copy as a correction, got %+v", correction)
	}
	// Alice must not have received the stale edit.
	send(t, bob, changeMessage("after stale"))
	if marker, from := receiveChange(t, alice); marker != "after stale" || from != bobID {
		t.Fatalf("stale edit was forwarded: %q from %q", marker, from)
	}
}

func TestRejectedChangesLeaveBoardIntact(t *testing.T) {
	const piece = 240_000 // Four pieces approach the new-element limit; each fits in one message.
	for _, tt := range []struct {
		name      string
		fill      bool
		change    message
		code      string
		elementID string
	}{
		{
			name: "invalid element",
			change: message{kind: websocket.MessageText, data: []byte(
				`{"type":"change","batchId":"b1","elements":[{"id":"x","version":"2","versionNonce":1,"isDeleted":false}]}`)},
			code:      codeInvalidElement,
			elementID: "x",
		},
		{
			name:      "conflict",
			change:    elementChange("x", 1, 1, false, "different content", "b1"),
			code:      codeConflict,
			elementID: "x",
		},
		{
			name:   "board full",
			fill:   true,
			change: elementChange("new", 1, 1, false, strings.Repeat("n", 30_000), "b1"),
			code:   codeBoardFull,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, url, _ := startServer(t)
			alice, _ := connect(t, url+"a")
			bob, _ := connect(t, url+"a")
			send(t, alice, elementChange("x", 1, 1, false, "base", ""))
			receiveChange(t, bob)
			if tt.fill {
				for _, id := range []string{"p1", "p2", "p3", "p4"} {
					send(t, alice, elementChange(id, 1, 1, false, strings.Repeat("p", piece), ""))
					receiveChange(t, bob)
				}
			}

			send(t, alice, tt.change)
			reply := receiveMessage(t, alice)
			if reply.Type != "error" || reply.Code != tt.code || reply.BatchID != "b1" || reply.ElementID != tt.elementID {
				t.Fatalf("unexpected reply: %+v", reply)
			}
			send(t, alice, changeMessage("after rejection"))
			if marker, _ := receiveChange(t, bob); marker != "after rejection" {
				t.Fatalf("rejected change was forwarded: %q", marker)
			}
			_, _, snapshot := joinBoard(t, url+"a")
			got := decodeElements(t, snapshot)
			if _, stored := got["new"]; stored || got["x"].Marker != "base" {
				t.Fatalf("rejected change altered the board: x=%+v", got["x"])
			}
		})
	}
}

func TestReconnectGetsMissedEdits(t *testing.T) {
	_, url, _ := startServer(t)
	alice, _ := connect(t, url+"a")
	bob, bobID := connect(t, url+"a")
	observer, _ := connect(t, url+"a")
	send(t, alice, elementChange("x", 1, 1, false, "x1", ""))
	send(t, alice, elementChange("y", 1, 1, false, "y1", ""))
	for range 2 {
		receiveChange(t, bob)
		receiveChange(t, observer)
	}

	_ = bob.CloseNow()
	for _, conn := range []*websocket.Conn{alice, observer} {
		if msg := receiveMessage(t, conn); msg.Type != "leave" {
			t.Fatalf("expected Bob's leave, got %+v", msg)
		}
	}
	send(t, alice, elementChange("x", 2, 1, false, "x2", ""))
	send(t, alice, elementChange("y", 2, 1, true, "y deleted", ""))
	receiveChange(t, observer)
	receiveChange(t, observer)

	_, newID, snapshot := joinBoard(t, url+"a")
	got := decodeElements(t, snapshot)
	if newID == bobID {
		t.Fatal("reconnect reused the old client ID")
	}
	if got["x"].Version != 2 || got["x"].Marker != "x2" || !got["y"].IsDeleted {
		t.Fatalf("snapshot missed edits made while away: %+v", got)
	}
}

func TestBoardsAreIsolated(t *testing.T) {
	_, url, _ := startServer(t)
	a1, _ := connect(t, url+"a")
	a2, _ := connect(t, url+"a")
	b1, _ := connect(t, url+"b")
	b2, _ := connect(t, url+"b")
	send(t, a1, changeMessage("on a"))
	receiveChange(t, a2)
	send(t, b2, changeMessage("on b"))
	if marker, _ := receiveChange(t, b1); marker != "on b" {
		t.Fatalf("board b received %q", marker)
	}
	_, _, snapshot := joinBoard(t, url+"b")
	for _, element := range decodeElements(t, snapshot) {
		if element.Marker != "on b" {
			t.Fatalf("board b's snapshot holds %+v", element)
		}
	}
}

func TestCursorIsNotStored(t *testing.T) {
	_, url, _ := startServer(t)
	alice, _ := connect(t, url+"a")
	observer, _ := connect(t, url+"a")
	send(t, alice, message{kind: websocket.MessageText, data: []byte(`{"type":"cursor","x":1,"y":2}`)})
	if msg := receiveMessage(t, observer); msg.Type != "cursor" {
		t.Fatalf("expected the cursor, got %+v", msg)
	}
	if _, _, snapshot := joinBoard(t, url+"a"); len(snapshot) != 0 {
		t.Fatalf("cursor was stored: %s", snapshot)
	}
}
