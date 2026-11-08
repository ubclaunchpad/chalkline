package realtime

import (
	"encoding/json"

	"github.com/coder/websocket"
)

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
	return joinedMessage(snapshotPrefix, elements)
}

func correctionMessage(elements []json.RawMessage) message {
	return joinedMessage(correctionPrefix, elements)
}

// joinedMessage joins element bytes with commas inside a fixed wrapper. The
// elements are not re-encoded, so the result is exactly as long as the
// scene's size accounting predicts.
func joinedMessage(prefix string, elements []json.RawMessage) message {
	size := len(prefix) + len(elementsSuffix) + max(len(elements)-1, 0)
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
	data = append(data, elementsSuffix...)
	return message{kind: websocket.MessageText, data: data}
}
