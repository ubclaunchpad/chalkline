package realtime

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/coder/websocket"
)

func TestValidateBoardID(t *testing.T) {
	for _, tt := range []struct {
		name, id string
		valid    bool
	}{
		{"missing", "", false},
		{"ordinary", "board-a", true},
		{"at limit", strings.Repeat("a", 64), true},
		{"over limit", strings.Repeat("a", 65), false},
		{"unicode at limit", strings.Repeat("界", 64), true},
		{"unicode over limit", strings.Repeat("界", 65), false},
		{"invalid UTF-8", "\xff", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateBoardID(tt.id); (err == nil) != tt.valid {
				t.Fatalf("valid = %v, want %v: %v", err == nil, tt.valid, err)
			}
		})
	}
}

func TestPrepareMessage(t *testing.T) {
	for _, tt := range []struct {
		name, body string
		valid      bool
	}{
		{"change", `{"type":"change","elements":[]}`, true},
		{"cursor", `{"type":"cursor","x":0,"y":1,"name":"Alice","color":"#fff"}`, true},
		{"envelope only", `{"type":"change"}`, true}, // Payload rules are deferred.
		{"bad JSON", `{"type":`, false},
		{"array", `[]`, false},
		{"null", `null`, false},
		{"scalar", `42`, false},
		{"missing type", `{}`, false},
		{"null type", `{"type":null}`, false},
		{"numeric type", `{"type":1}`, false},
		{"unsupported type", `{"type":"welcome"}`, false},
		{"case sensitive", `{"type":"Change"}`, false},
		{"trailing JSON", `{"type":"change"}{}`, false},
		{"invalid UTF-8", "{\"type\":\"change\",\"x\":\"\xff\"}", false},
		{"at size limit", sizedChange(maxMessageBytes), true},
		{"over size limit", sizedChange(maxMessageBytes + 1), false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			msg, err := prepareMessage([]byte(tt.body), "c_trusted")
			if (err == nil) != tt.valid {
				t.Fatalf("valid = %v, want %v: %v", err == nil, tt.valid, err)
			}
			if tt.valid && (msg.kind != websocket.MessageText || !json.Valid(msg.data)) {
				t.Fatal("expected encoded text JSON")
			}
		})
	}
}

func TestPrepareMessageReplacesFromAndPreservesPayload(t *testing.T) {
	msg, err := prepareMessage([]byte(`{"type":"change","from":{"fake":true},"elements":[{"version":9007199254740993}],"extra":"keep"}`), "c_trusted")
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(msg.data, &fields); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]string{
		"type": `"change"`, "from": `"c_trusted"`,
		"elements": `[{"version":9007199254740993}]`, "extra": `"keep"`,
	} {
		if string(fields[key]) != want {
			t.Errorf("%s = %s, want %s", key, fields[key], want)
		}
	}
}

func TestInvalidBoardRejectedBeforeUpgrade(t *testing.T) {
	hub := NewHub()
	for _, query := range []string{"", "?board=", "?board=" + url.QueryEscape(strings.Repeat("a", 65))} {
		recorder := httptest.NewRecorder()
		hub.HandleWebSocket(recorder, httptest.NewRequest(http.MethodGet, "/ws"+query, nil))
		if recorder.Code != http.StatusBadRequest || !strings.Contains(recorder.Body.String(), "board ID") {
			t.Fatalf("expected board validation HTTP 400, got %d: %s", recorder.Code, recorder.Body.String())
		}
	}
	if len(hub.rooms) != 0 {
		t.Fatal("invalid requests created rooms")
	}
}

func sizedChange(size int) string {
	const body = `{"type":"change","elements":[],"marker":"boundary"}`
	return body + strings.Repeat(" ", size-len(body))
}

func TestRejectedMessagesKeepRoomWorking(t *testing.T) {
	_, url, _ := startServer(t)
	alice, aliceID := connect(t, url+"a")
	bob, _ := connect(t, url+"a")
	for _, tt := range []struct {
		name, body, reason string
		kind               websocket.MessageType
	}{
		{"bad JSON", `{`, "message must be a JSON object", websocket.MessageText},
		{"unknown type", `{"type":"leave"}`, "message type must be change or cursor", websocket.MessageText},
		{"binary", `{"type":"change"}`, "message must be text JSON", websocket.MessageBinary},
		{"oversized", sizedChange(maxMessageBytes + 100), "message too large", websocket.MessageText},
	} {
		t.Run(tt.name, func(t *testing.T) {
			send(t, alice, message{kind: tt.kind, data: []byte(tt.body)})
			got := receive(t, alice)
			var reply struct{ Type, Message string }
			if err := json.Unmarshal(got.data, &reply); err != nil {
				t.Fatal(err)
			}
			if reply.Type != "error" || reply.Message != tt.reason {
				t.Fatalf("unexpected error reply: %s", got.data)
			}
			// An accepted message acts as a barrier: Bob must see it next, with
			// none of the rejected message forwarded ahead of it.
			send(t, alice, changeMessage("after error"))
			if marker, from := receiveChange(t, bob); marker != "after error" || from != aliceID {
				t.Fatalf("unexpected relay after error: %q from %q", marker, from)
			}
		})
	}
	// Exactly 1 MiB must remain acceptable, including after an oversized message.
	send(t, alice, message{kind: websocket.MessageText, data: []byte(sizedChange(maxMessageBytes))})
	if marker, from := receiveChange(t, bob); marker != "boundary" || from != aliceID {
		t.Fatalf("message at size limit was not relayed: %q from %q", marker, from)
	}
}
