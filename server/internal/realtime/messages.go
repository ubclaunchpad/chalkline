package realtime

import (
	"bytes"
	"encoding/json"

	"github.com/coder/websocket"
)

func lifecycleMessage(kind, clientID string) message {
	// A struct with only string fields always marshals successfully. Encoding
	// happens once; recipients can share the resulting immutable bytes.
	data, _ := json.Marshal(struct {
		Type     string `json:"type"`
		ClientID string `json:"clientId"`
	}{Type: kind, ClientID: clientID})
	return message{kind: websocket.MessageText, data: data}
}

// errorMessage reports a rejection to its sender. batchID is the rejected
// change's batchId, or "" when it is unknown.
func errorMessage(err *protocolError, batchID string) message {
	// String-only fields cannot fail JSON encoding.
	data, _ := json.Marshal(struct {
		Type      string `json:"type"`
		Code      string `json:"code"`
		Message   string `json:"message"`
		ElementID string `json:"elementId,omitempty"`
		BatchID   string `json:"batchId,omitempty"`
	}{Type: "error", Code: err.code, Message: err.message, ElementID: err.elementID, BatchID: batchID})
	return message{kind: websocket.MessageText, data: data}
}

// forwardedChange re-encodes a change with only the given elements, keeping
// every other top-level field. It replaces fields["elements"]. HTML escaping
// is off and the encoder's trailing newline is dropped, so element bytes
// never grow.
func forwardedChange(fields map[string]json.RawMessage, elements []json.RawMessage) (message, error) {
	fields["elements"] = joinElements("[", elements, "]")
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(fields); err != nil {
		return message{}, err
	}
	return message{kind: websocket.MessageText, data: bytes.TrimSuffix(encoded.Bytes(), []byte("\n"))}, nil
}

// Codes sent in the "code" field of an error message. The browser can act on
// the code; the "message" text is for people reading logs.
const (
	codeInvalidMessage  = "invalid_message"
	codeMessageTooLarge = "message_too_large"
	codeInvalidElement  = "invalid_element"
	codeConflict        = "conflict"
	codeBoardFull       = "board_full"
)

// protocolError is a rejected message, reported back to its sender.
type protocolError struct {
	code      string
	message   string
	elementID string // Set only when one element caused the rejection.
}

func (e *protocolError) Error() string { return e.message }

// Server-built messages around a list of stored elements. The correction
// wrapper is the longer one, so the scene measures board size against it.
const (
	snapshotPrefix   = `{"type":"snapshot","elements":[`
	correctionPrefix = `{"type":"change","from":"server","elements":[`
	elementsSuffix   = `]}`
)

func snapshotMessage(elements []json.RawMessage) message {
	return message{kind: websocket.MessageText, data: joinElements(snapshotPrefix, elements, elementsSuffix)}
}

func correctionMessage(elements []json.RawMessage) message {
	return message{kind: websocket.MessageText, data: joinElements(correctionPrefix, elements, elementsSuffix)}
}

// joinElements joins element bytes with commas between a prefix and suffix.
// The elements are not re-encoded, so snapshots and corrections are exactly as
// long as the scene's size accounting predicts.
func joinElements(prefix string, elements []json.RawMessage, suffix string) []byte {
	size := len(prefix) + len(suffix) + max(len(elements)-1, 0)
	for _, element := range elements {
		size += len(element)
	}
	data := make([]byte, 0, size)
	data = append(data, prefix...)
	for i, element := range elements {
		if i > 0 {
			data = append(data, ',')
		}
		data = append(data, element...)
	}
	return append(data, suffix...)
}
