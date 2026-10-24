package realtime

import (
	"encoding/json"
	"errors"
	"unicode/utf8"

	"github.com/coder/websocket"
)

const maxMessageBytes = 1 << 20 // 1 MiB, measured before adding the sender ID.

func validateBoardID(id string) error {
	if !utf8.ValidString(id) || id == "" || utf8.RuneCountInString(id) > 64 {
		return errors.New("board ID must contain 1 to 64 characters")
	}
	return nil
}

// prepareMessage validates the envelope and sets the server-owned sender ID.
// RawMessage preserves payload fields without interpreting Excalidraw elements
// or converting their numbers to float64. Payload validation is separate work.
func prepareMessage(data []byte, clientID string) (message, error) {
	if len(data) > maxMessageBytes {
		return message{}, errors.New("message too large")
	}
	var fields map[string]json.RawMessage
	if !utf8.Valid(data) || json.Unmarshal(data, &fields) != nil || fields == nil {
		return message{}, errors.New("message must be a JSON object")
	}
	var kind string
	if json.Unmarshal(fields["type"], &kind) != nil || (kind != "change" && kind != "cursor") {
		return message{}, errors.New("message type must be change or cursor")
	}
	// Always replace a claimed identity, even if the browser supplied one.
	fields["from"], _ = json.Marshal(clientID)
	encoded, err := json.Marshal(fields)
	if err != nil {
		return message{}, err
	}
	return message{kind: websocket.MessageText, data: encoded}, nil
}

func errorMessage(reason string) message {
	// String-only fields cannot fail JSON encoding.
	data, _ := json.Marshal(struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}{Type: "error", Message: reason})
	return message{kind: websocket.MessageText, data: data}
}
