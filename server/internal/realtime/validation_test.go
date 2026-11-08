package realtime

import (
	"encoding/json"
	"fmt"
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

// elementJSON writes one element with each field's raw JSON as given. An empty
// value leaves that field out.
func elementJSON(id, version, nonce, deleted string) string {
	var fields []string
	for _, field := range [][2]string{{"id", id}, {"version", version}, {"versionNonce", nonce}, {"isDeleted", deleted}} {
		if field[1] != "" {
			fields = append(fields, fmt.Sprintf("%q:%s", field[0], field[1]))
		}
	}
	return "{" + strings.Join(fields, ",") + "}"
}

func changeJSON(elements ...string) string {
	return `{"type":"change","elements":[` + strings.Join(elements, ",") + `]}`
}

func TestPrepareMessage(t *testing.T) {
	good := elementJSON(`"a"`, "1", "1", "false")
	longID := `"` + strings.Repeat("a", 65) + `"`
	type testCase struct {
		name, body, code string
		elementID        string // Expected for invalid_element.
		reason           string // Expected message text, when set.
	}
	tests := []testCase{
		// Accepted.
		{name: "change", body: changeJSON(good)},
		{name: "empty elements", body: changeJSON()},
		{name: "cursor", body: `{"type":"cursor","x":0,"y":1,"name":"Alice","color":"#fff"}`},
		{name: "largest safe numbers", body: changeJSON(elementJSON(`"a"`, "9007199254740991", "9007199254740991", "true"))},
		{name: "zero version", body: changeJSON(elementJSON(`"a"`, "0", "0", "false"))},
		{name: "batchId", body: `{"type":"change","batchId":"b1","elements":[]}`},
		{name: "at size limit", body: sizedChange(maxMessageBytes)},

		// Envelope problems.
		{name: "bad JSON", body: `{"type":`, code: codeInvalidMessage},
		{name: "array", body: `[]`, code: codeInvalidMessage},
		{name: "null", body: `null`, code: codeInvalidMessage},
		{name: "scalar", body: `42`, code: codeInvalidMessage},
		{name: "missing type", body: `{}`, code: codeInvalidMessage},
		{name: "null type", body: `{"type":null}`, code: codeInvalidMessage},
		{name: "numeric type", body: `{"type":1}`, code: codeInvalidMessage},
		{name: "unsupported type", body: `{"type":"welcome"}`, code: codeInvalidMessage},
		{name: "case sensitive", body: `{"type":"Change"}`, code: codeInvalidMessage},
		{name: "trailing JSON", body: `{"type":"change"}{}`, code: codeInvalidMessage},
		{name: "invalid UTF-8", body: "{\"type\":\"change\",\"x\":\"\xff\"}", code: codeInvalidMessage},
		{name: "over size limit", body: sizedChange(maxMessageBytes + 1), code: codeMessageTooLarge},
		{name: "empty batchId", body: `{"type":"change","batchId":"","elements":[]}`, code: codeInvalidMessage},
		{name: "long batchId", body: `{"type":"change","batchId":` + longID + `,"elements":[]}`, code: codeInvalidMessage},
		{name: "numeric batchId", body: `{"type":"change","batchId":7,"elements":[]}`, code: codeInvalidMessage},
		{name: "null batchId", body: `{"type":"change","batchId":null,"elements":[]}`, code: codeInvalidMessage},

		// Element problems.
		{name: "envelope only", body: `{"type":"change"}`, code: codeInvalidElement},
		{name: "null elements", body: `{"type":"change","elements":null}`, code: codeInvalidElement},
		{name: "numeric elements", body: `{"type":"change","elements":7}`, code: codeInvalidElement},
		{name: "object elements", body: `{"type":"change","elements":{}}`, code: codeInvalidElement},
		{name: "null element", body: changeJSON("null"), code: codeInvalidElement, reason: "element must be a JSON object"},
		{name: "numeric element", body: changeJSON("7"), code: codeInvalidElement, reason: "element must be a JSON object"},
		{name: "null id", body: changeJSON(elementJSON("null", "1", "1", "false")), code: codeInvalidElement,
			reason: "element id must contain 1 to 64 characters"},
		{name: "missing id", body: changeJSON(elementJSON("", "1", "1", "false")), code: codeInvalidElement},
		{name: "empty id", body: changeJSON(elementJSON(`""`, "1", "1", "false")), code: codeInvalidElement},
		{name: "long id", body: changeJSON(elementJSON(longID, "1", "1", "false")),
			code: codeInvalidElement, elementID: strings.Repeat("a", 65)},
		{name: "numeric id", body: changeJSON(elementJSON("7", "1", "1", "false")), code: codeInvalidElement},
		{name: "capitalized key", body: changeJSON(`{"id":"a","Version":1,"versionNonce":1,"isDeleted":false}`),
			code: codeInvalidElement, elementID: "a"},
		{name: "missing isDeleted", body: changeJSON(elementJSON(`"a"`, "1", "1", "")),
			code: codeInvalidElement, elementID: "a"},
		{name: "string isDeleted", body: changeJSON(elementJSON(`"a"`, "1", "1", `"false"`)),
			code: codeInvalidElement, elementID: "a"},
		{name: "null isDeleted", body: changeJSON(elementJSON(`"a"`, "1", "1", "null")),
			code: codeInvalidElement, elementID: "a"},
		{name: "duplicate id", body: changeJSON(good, good), code: codeInvalidElement, elementID: "a"},
	}
	// A leading zero is not valid JSON, so the whole message is rejected
	// before any element check runs.
	tests = append(tests,
		testCase{name: "version 07", body: changeJSON(elementJSON(`"a"`, "07", "1", "false")), code: codeInvalidMessage},
		testCase{name: "versionNonce 07", body: changeJSON(elementJSON(`"a"`, "1", "07", "false")), code: codeInvalidMessage},
	)
	for _, bad := range []string{`"7"`, "-1", "1.0", "1e3", "null", "9007199254740992"} {
		tests = append(tests,
			testCase{name: "version " + bad, body: changeJSON(elementJSON(`"a"`, bad, "1", "false")),
				code: codeInvalidElement, elementID: "a"},
			testCase{name: "versionNonce " + bad, body: changeJSON(elementJSON(`"a"`, "1", bad, "false")),
				code: codeInvalidElement, elementID: "a"},
		)
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, err := prepareMessage([]byte(tt.body), "c_trusted")
			if tt.code != "" {
				if err == nil || err.code != tt.code {
					t.Fatalf("got %+v, want code %s", err, tt.code)
				}
				if tt.code == codeInvalidElement && err.elementID != tt.elementID {
					t.Fatalf("elementID = %q, want %q", err.elementID, tt.elementID)
				}
				if tt.reason != "" && err.message != tt.reason {
					t.Fatalf("message = %q, want %q", err.message, tt.reason)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected %s: %s", err.code, err.message)
			}
			switch p.kind {
			case "cursor":
				if p.encoded.kind != websocket.MessageText || !json.Valid(p.encoded.data) {
					t.Fatal("expected encoded text JSON")
				}
			case "change":
				if string(p.fields["from"]) != `"c_trusted"` {
					t.Fatalf("from = %s", p.fields["from"])
				}
			}
		})
	}
}

func TestPrepareMessageReplacesFromAndPreservesPayload(t *testing.T) {
	p, err := prepareMessage([]byte(`{"type":"change","from":{"fake":true},"elements":[`+
		`{"id":"a","version":9007199254740991,"versionNonce":2,"isDeleted":false,"note":"keep"}],"extra":"keep"}`), "c_trusted")
	if err != nil {
		t.Fatal(err)
	}
	if string(p.fields["from"]) != `"c_trusted"` || string(p.fields["extra"]) != `"keep"` {
		t.Fatalf("from = %s, extra = %s", p.fields["from"], p.fields["extra"])
	}
	if len(p.elements) != 1 {
		t.Fatalf("got %d elements", len(p.elements))
	}
	element := p.elements[0]
	if element.id != "a" || element.version != 9007199254740991 || element.versionNonce != 2 || element.isDeleted {
		t.Fatalf("parsed %+v", element)
	}
	if !strings.Contains(string(element.raw), `"note":"keep"`) {
		t.Fatalf("raw element lost a field: %s", element.raw)
	}
}

func TestRejectedChangeKeepsBatchID(t *testing.T) {
	p, err := prepareMessage([]byte(`{"type":"change","batchId":"b1","elements":[null]}`), "c_trusted")
	if err == nil || err.code != codeInvalidElement || p.batchID != "b1" {
		t.Fatalf("got %+v with batchID %q", err, p.batchID)
	}
}

func TestFingerprintOf(t *testing.T) {
	fingerprint := func(raw string) [32]byte {
		t.Helper()
		f, err := fingerprintOf(json.RawMessage(raw))
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	base := fingerprint(`{"id":"a","label":"A -> B","n":1}`)
	for _, same := range []string{
		`{"n":1,"label":"A -> B","id":"a"}`,
		"{ \"id\" : \"a\",\n  \"label\" : \"A -> B\", \"n\" : 1 }",
		`{"id":"a","label":"A -\u003e B","n":1}`,
	} {
		if fingerprint(same) != base {
			t.Errorf("%s should match the base element", same)
		}
	}
	for _, different := range []string{
		`{"id":"a","label":"A -> B","n":1.0}`,
		`{"id":"a","label":"A -> C","n":1}`,
	} {
		if fingerprint(different) == base {
			t.Errorf("%s should differ from the base element", different)
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
		name, body, code, reason string
		kind                     websocket.MessageType
	}{
		{"bad JSON", `{`, codeInvalidMessage, "message must be a JSON object", websocket.MessageText},
		{"unknown type", `{"type":"leave"}`, codeInvalidMessage, "message type must be change or cursor", websocket.MessageText},
		{"binary", `{"type":"change"}`, codeInvalidMessage, "message must be text JSON", websocket.MessageBinary},
		{"oversized", sizedChange(maxMessageBytes + 100), codeMessageTooLarge, "message too large", websocket.MessageText},
	} {
		t.Run(tt.name, func(t *testing.T) {
			send(t, alice, message{kind: tt.kind, data: []byte(tt.body)})
			got := receive(t, alice)
			var reply struct{ Type, Code, Message string }
			if err := json.Unmarshal(got.data, &reply); err != nil {
				t.Fatal(err)
			}
			if reply.Type != "error" || reply.Code != tt.code || reply.Message != tt.reason {
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
