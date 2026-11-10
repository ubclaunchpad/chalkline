package store

import (
	"encoding/json"
	"fmt"
	"sort"
	"unicode/utf8"
)

// Snapshot contains the complete scene through a durable operation sequence.
type Snapshot struct {
	Elements        json.RawMessage
	ThroughSequence int64
}

// Operation contains one already accepted batch of complete element revisions.
// Conflict resolution belongs to the room; this is not a browser message.
type Operation struct {
	Sequence int64
	Elements json.RawMessage
}

func validID(id string) bool {
	return utf8.ValidString(id) && id != "" && utf8.RuneCountInString(id) <= 64
}

func elementMap(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var items []json.RawMessage
	if !utf8.Valid(raw) || json.Unmarshal(raw, &items) != nil || items == nil {
		return nil, fmt.Errorf("elements must be a JSON array")
	}
	out := make(map[string]json.RawMessage, len(items))
	for _, item := range items {
		var fields map[string]json.RawMessage
		if json.Unmarshal(item, &fields) != nil || fields == nil {
			return nil, fmt.Errorf("element must be an object")
		}
		var id string
		if json.Unmarshal(fields["id"], &id) != nil || !validID(id) {
			return nil, fmt.Errorf("invalid element id")
		}
		if _, exists := out[id]; exists {
			return nil, fmt.Errorf("duplicate element id %q", id)
		}
		out[id] = item
	}
	return out, nil
}

// RebuildSnapshot applies a contiguous sequence of accepted batches. Unknown
// fields and tombstones survive. It never changes its inputs or rejudges winners.
func RebuildSnapshot(base Snapshot, operations []Operation) (Snapshot, error) {
	if base.ThroughSequence < 0 {
		return Snapshot{}, fmt.Errorf("negative snapshot sequence")
	}
	elements, err := elementMap(base.Elements)
	if err != nil {
		return Snapshot{}, err
	}
	sequence := base.ThroughSequence
	for _, op := range operations {
		if op.Sequence <= sequence || op.Sequence-sequence != 1 {
			return Snapshot{}, fmt.Errorf("noncontiguous operation sequence %d after %d", op.Sequence, sequence)
		}
		changed, err := elementMap(op.Elements)
		if err != nil {
			return Snapshot{}, err
		}
		if len(changed) == 0 {
			return Snapshot{}, fmt.Errorf("empty operation")
		}
		for id, raw := range changed {
			elements[id] = raw
		}
		sequence = op.Sequence
	}
	ids := make([]string, 0, len(elements))
	for id := range elements {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	ordered := make([]json.RawMessage, 0, len(ids))
	for _, id := range ids {
		ordered = append(ordered, elements[id])
	}
	raw, err := json.Marshal(ordered)
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Elements: raw, ThroughSequence: sequence}, nil
}
