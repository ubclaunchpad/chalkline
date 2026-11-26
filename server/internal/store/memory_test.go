package store

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestMemoryAppendLoadAndConflicts(t *testing.T) {
	m := NewMemory()
	ctx := t.Context()
	if _, err := m.LoadBoard(ctx, "b"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing board: %v", err)
	}
	a := json.RawMessage(`[{"id":"x","version":1}]`)
	b := json.RawMessage(`[{"id":"x","version":2},{"id":"y","version":1}]`)
	if end, err := m.AppendOperations(ctx, "b", 0, []json.RawMessage{a, b}); err != nil || end != 2 {
		t.Fatalf("append: %d %v", end, err)
	}
	if end, err := m.AppendOperations(ctx, "b", 0, []json.RawMessage{a, b}); err != nil || end != 2 {
		t.Fatalf("exact retry should succeed: %d %v", end, err)
	}
	if _, err := m.AppendOperations(ctx, "b", 1, []json.RawMessage{a}); !errors.Is(err, ErrSequenceConflict) {
		t.Fatalf("stale sequence: %v", err)
	}
	snap, err := m.LoadBoard(ctx, "b")
	if err != nil || snap.ThroughSequence != 2 || string(snap.Elements) != `[{"id":"x","version":2},{"id":"y","version":1}]` {
		t.Fatalf("load: %s %d %v", snap.Elements, snap.ThroughSequence, err)
	}
}
