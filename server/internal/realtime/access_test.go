package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestMemoryAccessIssuesKeysOnce(t *testing.T) {
	access := NewMemoryAccess()
	ctx := t.Context()

	// Two people open a new board at the same moment: only one becomes creator.
	var wg sync.WaitGroup
	results := make(chan error, 8)
	creators := make(chan BoardKeys, 8)
	for range 8 {
		wg.Go(func() {
			grant, err := access.Grant(ctx, "a", "", "")
			if err == nil {
				creators <- *grant.Keys
			}
			results <- err
		})
	}
	wg.Wait()
	close(results)
	close(creators)
	forbidden := 0
	for err := range results {
		if errors.Is(err, ErrForbidden) {
			forbidden++
		}
	}
	if forbidden != 7 || len(creators) != 1 {
		t.Fatalf("got %d forbidden and %d creators, want 7 and 1", forbidden, len(creators))
	}
	keys := <-creators
	if keys.Edit == "" || keys.View == "" || keys.Edit == keys.View {
		t.Fatalf("bad keys %+v", keys)
	}

	edit, err := access.Grant(ctx, "a", keys.Edit, "")
	if err != nil || edit.Access != AccessEdit || edit.Keys == nil || *edit.Keys != keys {
		t.Fatalf("edit key: got %+v, %v; want edit with the same keys", edit, err)
	}
	view, err := access.Grant(ctx, "a", keys.View, "")
	if err != nil || view.Access != AccessView || view.Keys != nil {
		t.Fatalf("view key: got %+v, %v; want view without keys", view, err)
	}
	if _, err := access.Grant(ctx, "a", "wrong", ""); !errors.Is(err, ErrForbidden) {
		t.Fatalf("wrong key: got %v, want ErrForbidden", err)
	}
	// Another board's keys do not open this one.
	other, _ := access.Grant(ctx, "b", keys.Edit, "")
	if other.Keys == nil || *other.Keys == keys {
		t.Fatal("board b should get its own new keys")
	}
}

func TestMemoryAccessAdoptsClaimOnlyForNewBoards(t *testing.T) {
	access := NewMemoryAccess()
	claim := strings.Repeat("c", 26)
	grant, err := access.Grant(t.Context(), "a", "", claim)
	if err != nil || grant.Access != AccessEdit || grant.Keys.Edit != claim {
		t.Fatalf("got %+v, %v; want the claim as the edit key", grant, err)
	}
	// Once the board has keys, a claim grants nothing.
	if _, err := access.Grant(t.Context(), "a", "", strings.Repeat("d", 26)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("second claim: got %v, want ErrForbidden", err)
	}
	// A short claim is ignored and the server makes the key.
	short, _ := access.Grant(t.Context(), "b", "", "short")
	if short.Keys.Edit == "short" {
		t.Fatal("a short claim must not become the edit key")
	}
}

func startAccessServer(t *testing.T) string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	hub := NewHub().WithAccess(NewMemoryAccess())
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
	return "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?board="
}

type welcomeWithAccess struct {
	Type     string     `json:"type"`
	ClientID string     `json:"clientId"`
	Access   string     `json:"access"`
	Keys     *BoardKeys `json:"keys"`
}

// joinWithKey connects, returns the welcome, and skips the snapshot and roster.
func joinWithKey(t *testing.T, url string) (*websocket.Conn, welcomeWithAccess) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	var welcome welcomeWithAccess
	if err := json.Unmarshal(receive(t, conn).data, &welcome); err != nil || welcome.Type != "welcome" {
		t.Fatalf("expected welcome, got %+v (%v)", welcome, err)
	}
	receive(t, conn) // snapshot
	receiveParticipants(t, conn)
	return conn, welcome
}

func expectError(t *testing.T, conn *websocket.Conn, code, batchID string) {
	t.Helper()
	var got struct{ Type, Code, BatchID string }
	if err := json.Unmarshal(receive(t, conn).data, &got); err != nil || got.Type != "error" || got.Code != code || got.BatchID != batchID {
		t.Fatalf("expected %s error for batch %q, got %+v", code, batchID, got)
	}
}

func TestViewLinkCannotChangeBoard(t *testing.T) {
	url := startAccessServer(t) + "a"

	creator, welcome := joinWithKey(t, url)
	if welcome.Access != AccessEdit || welcome.Keys == nil {
		t.Fatalf("creator welcome = %+v, want edit with keys", welcome)
	}
	keys := *welcome.Keys

	viewer, viewWelcome := joinWithKey(t, url+"&key="+keys.View)
	if viewWelcome.Access != AccessView || viewWelcome.Keys != nil {
		t.Fatalf("viewer welcome = %+v, want view without keys", viewWelcome)
	}
	receiveParticipants(t, creator)

	editor, editWelcome := joinWithKey(t, url+"&key="+keys.Edit)
	if editWelcome.Access != AccessEdit || editWelcome.Keys == nil || *editWelcome.Keys != keys {
		t.Fatalf("editor welcome = %+v, want edit with the same keys", editWelcome)
	}
	receiveParticipants(t, creator)
	receiveParticipants(t, viewer)

	// A viewer's change is refused and reaches no one; its cursor still does.
	send(t, viewer, elementChange("v1", 1, 1, false, "from viewer", "b1"))
	expectError(t, viewer, codeForbidden, "b1")
	send(t, viewer, message{kind: websocket.MessageText, data: []byte(`{"type":"cursor","x":1,"y":2,"name":"V","color":"#fff","selectedElementIds":["e1"]}`)})
	for _, conn := range []*websocket.Conn{creator, editor} {
		var cursor struct {
			Type     string
			Selected []string `json:"selectedElementIds"`
		}
		if err := json.Unmarshal(receive(t, conn).data, &cursor); err != nil || cursor.Type != "cursor" || len(cursor.Selected) != 1 {
			t.Fatalf("expected the viewer's cursor with its selection, got %+v", cursor)
		}
	}

	// An edit link's change is applied and forwarded, viewers included.
	send(t, editor, changeMessage("from editor"))
	for _, conn := range []*websocket.Conn{creator, viewer} {
		if marker, _ := receiveChange(t, conn); marker != "from editor" {
			t.Fatalf("got %q, want the editor's change", marker)
		}
	}
}

func TestBoardWithKeysRefusesMissingOrWrongKey(t *testing.T) {
	url := startAccessServer(t) + "a"
	joinWithKey(t, url)

	for _, suffix := range []string{"", "&key=wrong"} {
		ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
		conn, _, err := websocket.Dial(ctx, url+suffix, nil)
		if err != nil {
			cancel()
			t.Fatal(err)
		}
		expectError(t, conn, codeKeyRequired, "")
		_, _, err = conn.Read(ctx)
		cancel()
		if websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
			t.Fatalf("key %q: got %v, want a policy-violation close", suffix, err)
		}
	}
}

func TestHubWithoutAccessLetsEveryoneEdit(t *testing.T) {
	_, url, _ := startServer(t)
	conn, _, err := websocket.Dial(t.Context(), url+"a", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if got := string(receive(t, conn).data); strings.Contains(got, "access") || strings.Contains(got, "keys") {
		t.Fatalf("welcome without an access store should not mention access: %s", got)
	}
}
