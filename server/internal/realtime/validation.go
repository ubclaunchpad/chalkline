package realtime

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strconv"
	"unicode/utf8"

	"github.com/coder/websocket"
)

const (
	maxMessageBytes = 1 << 20   // 1 MiB, measured before adding the sender ID.
	maxSafeInteger  = 1<<53 - 1 // Largest whole number JavaScript stores exactly.
)

func validateBoardID(id string) error {
	if !validID(id) {
		return errors.New("board ID must contain 1 to 64 characters")
	}
	return nil
}

// validID accepts UTF-8 with 1 to 64 code points. Board IDs, element IDs and
// batch IDs share this rule and are used exactly as supplied.
func validID(id string) bool {
	return utf8.ValidString(id) && id != "" && utf8.RuneCountInString(id) <= 64
}

// shortID cuts an id to the 64 code points a valid id may have. It counts code
// points, not bytes, so it never splits a multi-byte character.
func shortID(id string) string {
	count := 0
	for i := range id {
		if count == 64 {
			return id[:i]
		}
		count++
	}
	return id
}

// prepared is a validated browser message.
type prepared struct {
	kind     string
	fields   map[string]json.RawMessage // Top-level fields, with a trusted "from".
	elements []incomingElement          // Set for change messages.
	batchID  string                     // Optional; echoed in errors about this change.
	encoded  message                    // Set for cursor messages only.
}

// prepareMessage validates a message and sets the server-owned sender ID.
// RawMessage keeps payload fields intact without converting their numbers to
// float64. When a change is rejected after its batchId was read, the returned
// prepared still carries batchID so the error can echo it.
func prepareMessage(data []byte, clientID string) (prepared, *protocolError) {
	if len(data) > maxMessageBytes {
		return prepared{}, &protocolError{code: codeMessageTooLarge, message: "message too large"}
	}
	var fields map[string]json.RawMessage
	if !utf8.Valid(data) || json.Unmarshal(data, &fields) != nil || fields == nil {
		return prepared{}, invalidMessage("message must be a JSON object")
	}
	var kind string
	if json.Unmarshal(fields["type"], &kind) != nil || (kind != "change" && kind != "cursor") {
		return prepared{}, invalidMessage("message type must be change or cursor")
	}
	// Always replace a claimed identity, even if the browser supplied one.
	fields["from"], _ = json.Marshal(clientID)
	p := prepared{kind: kind, fields: fields}

	if kind == "cursor" {
		encoded, err := json.Marshal(fields)
		if err != nil {
			return prepared{}, invalidMessage("message must be a JSON object")
		}
		p.encoded = message{kind: websocket.MessageText, data: encoded}
		return p, nil
	}

	if raw, present := fields["batchId"]; present {
		// null decodes to "" and fails validID, so it is rejected too.
		if json.Unmarshal(raw, &p.batchID) != nil || !validID(p.batchID) {
			p.batchID = ""
			return p, invalidMessage("batchId must be a string of 1 to 64 characters")
		}
	}
	elements, perr := parseElements(fields["elements"])
	if perr != nil {
		return p, perr
	}
	p.elements = elements
	return p, nil
}

// parseElements checks every element of a change. Go decodes JSON null into
// an empty slice, map or false without an error, so each rule checks the raw
// bytes where that matters.
func parseElements(raw json.RawMessage) ([]incomingElement, *protocolError) {
	var items []json.RawMessage
	if !bytes.HasPrefix(bytes.TrimSpace(raw), []byte("[")) || json.Unmarshal(raw, &items) != nil {
		return nil, invalidElement("elements must be an array", "")
	}
	elements := make([]incomingElement, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		element, perr := parseElement(item)
		if perr != nil {
			return nil, perr
		}
		if seen[element.id] {
			return nil, invalidElement("element id appears twice in one change", element.id)
		}
		seen[element.id] = true
		elements = append(elements, element)
	}
	return elements, nil
}

func parseElement(raw json.RawMessage) (incomingElement, *protocolError) {
	// A map matches keys exactly, as JavaScript does. Decoding into a struct
	// would also accept "Version" for "version".
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return incomingElement{}, invalidElement("element must be a JSON object", "")
	}

	// A non-string id fails to decode and leaves id empty; null decodes to "".
	// Either way only a string id is echoed back, and only its first 64 code
	// points, so a huge id doesn't make a huge error message.
	var id string
	if json.Unmarshal(fields["id"], &id) != nil || !validID(id) {
		return incomingElement{}, invalidElement("element id must contain 1 to 64 characters", shortID(id))
	}

	version, versionOK := parseWholeNumber(fields["version"])
	nonce, nonceOK := parseWholeNumber(fields["versionNonce"])
	if !versionOK || !nonceOK {
		return incomingElement{}, invalidElement(
			"version and versionNonce must be whole numbers from 0 to 9007199254740991", id)
	}

	var isDeleted bool
	switch string(fields["isDeleted"]) {
	case "true":
		isDeleted = true
	case "false":
	default:
		return incomingElement{}, invalidElement("isDeleted must be true or false", id)
	}

	fingerprint, err := fingerprintOf(raw)
	if err != nil {
		return incomingElement{}, invalidElement("element must be a JSON object", id)
	}
	return incomingElement{
		id:           id,
		raw:          raw,
		version:      version,
		versionNonce: nonce,
		isDeleted:    isDeleted,
		fingerprint:  fingerprint,
	}, nil
}

// parseWholeNumber accepts a plain JSON integer from 0 to maxSafeInteger, as
// written: no sign, decimal point or exponent. JSON itself forbids leading
// zeros, so the message would already have failed to parse.
func parseWholeNumber(raw json.RawMessage) (int64, bool) {
	text := string(raw)
	if text == "" {
		return 0, false
	}
	for i := range len(text) {
		if text[i] < '0' || text[i] > '9' {
			return 0, false
		}
	}
	n, err := strconv.ParseInt(text, 10, 64)
	if err != nil || n > maxSafeInteger {
		return 0, false
	}
	return n, true
}

// fingerprintOf summarizes an element's content so two copies can be compared
// without decoding them under the room lock. Re-encoding a decoded value
// sorts object keys and drops whitespace, and SetEscapeHTML(false) undoes
// escapes such as \u003e. UseNumber keeps each number's exact text.
func fingerprintOf(raw json.RawMessage) ([32]byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return [32]byte{}, err
	}
	var normalized bytes.Buffer
	encoder := json.NewEncoder(&normalized)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return [32]byte{}, err
	}
	return sha256.Sum256(normalized.Bytes()), nil
}

func invalidMessage(reason string) *protocolError {
	return &protocolError{code: codeInvalidMessage, message: reason}
}

func invalidElement(reason, elementID string) *protocolError {
	return &protocolError{code: codeInvalidElement, message: reason, elementID: elementID}
}
