package realtime

import (
	"encoding/json"
	"slices"
)

// Board size limits. Every server message built from the board must fit in
// one 1 MiB message. New elements stop 64 KiB earlier, because ordinary edits
// change an element's length by a few bytes (a new random versionNonce can
// gain or lose a digit). The headroom keeps a full board editable.
const (
	hardLimit       = 1 << 20
	newElementLimit = hardLimit - 64<<10
	largestEnvelope = len(correctionPrefix) + len(elementsSuffix)
)

// incomingElement is one element from a change, already validated.
type incomingElement struct {
	id           string
	raw          json.RawMessage // Exactly as received, so unknown fields survive.
	version      int64
	versionNonce int64
	isDeleted    bool
	fingerprint  [32]byte // Same content gives the same fingerprint.
}

type storedElement struct {
	raw          json.RawMessage
	version      int64
	versionNonce int64
	isDeleted    bool
	fingerprint  [32]byte
}

// scene is a room's copy of its board: the winning copy of every element,
// with deleted elements kept as tombstones so an older copy can't bring them
// back. It has no lock of its own; the room's mutex guards it.
type scene struct {
	elements map[string]storedElement
	rawBytes int // Sum of len(raw) over elements.
}

func newScene() *scene {
	return &scene{elements: make(map[string]storedElement)}
}

// messageSize is the length of the largest message that can carry all of the
// board's elements: the correction wrapper, the elements and their commas.
func messageSize(count, rawBytes int) int {
	return largestEnvelope + rawBytes + max(count-1, 0)
}

// beats reports whether a candidate replaces the stored copy. It is the same
// rule as shouldReplaceElement in frontend/src/realtime/sceneSync.ts, so the
// server and every browser pick the same winner in any arrival order.
func beats(candidate incomingElement, stored storedElement) bool {
	return candidate.version > stored.version ||
		(candidate.version == stored.version && candidate.versionNonce < stored.versionNonce)
}

// apply merges a change into the board. It returns the elements that won (to
// forward to other clients) and the stored copies of elements that lost (to
// send back to the sender). A conflict or an over-limit change is rejected
// whole and leaves the board unchanged. The caller guarantees that element IDs
// in one change are unique.
func (s *scene) apply(in []incomingElement) (winners, corrections []json.RawMessage, err *protocolError) {
	// Pass 1 decides every outcome before anything is stored.
	var won []incomingElement
	count, rawBytes := len(s.elements), s.rawBytes
	addsNew := false
	for _, element := range in {
		stored, exists := s.elements[element.id]
		switch {
		case !exists:
			won = append(won, element)
			addsNew = true
			count++
			rawBytes += len(element.raw)
		case beats(element, stored):
			won = append(won, element)
			rawBytes += len(element.raw) - len(stored.raw)
		case element.version == stored.version && element.versionNonce == stored.versionNonce:
			if element.fingerprint != stored.fingerprint {
				return nil, nil, &protocolError{
					code:      codeConflict,
					message:   "same version and versionNonce with different content",
					elementID: element.id,
				}
			}
			// Same content: a harmless duplicate.
		default:
			corrections = append(corrections, stored.raw)
		}
	}

	// A change that doesn't grow the board is always accepted, so deletes and
	// shortening edits still work on a full board.
	limit := hardLimit
	if addsNew {
		limit = newElementLimit
	}
	next := messageSize(count, rawBytes)
	if next > messageSize(len(s.elements), s.rawBytes) && next > limit {
		return nil, nil, &protocolError{code: codeBoardFull, message: "board is full"}
	}

	// Pass 2 stores the winners.
	for _, element := range won {
		s.elements[element.id] = storedElement{
			raw:          element.raw,
			version:      element.version,
			versionNonce: element.versionNonce,
			isDeleted:    element.isDeleted,
			fingerprint:  element.fingerprint,
		}
		winners = append(winners, element.raw)
	}
	s.rawBytes = rawBytes
	return winners, corrections, nil
}

// snapshot returns every stored element, tombstones included, sorted by ID so
// the output is predictable. Browsers re-sort by fractional index anyway.
func (s *scene) snapshot() []json.RawMessage {
	ids := make([]string, 0, len(s.elements))
	for id := range s.elements {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	elements := make([]json.RawMessage, len(ids))
	for i, id := range ids {
		elements[i] = s.elements[id].raw
	}
	return elements
}
