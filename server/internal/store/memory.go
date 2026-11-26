package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
)

// Memory keeps boards in process memory with the same rules as Postgres.
// shortcut: boards are lost on restart; use Postgres for anything shared.
type Memory struct {
	mu     sync.Mutex
	boards map[string][]Operation
}

func NewMemory() *Memory { return &Memory{boards: map[string][]Operation{}} }

func (m *Memory) AppendOperations(_ context.Context, boardID string, expectedSequence int64, batches []json.RawMessage) (int64, error) {
	if !validID(boardID) || expectedSequence < 0 || len(batches) == 0 || int64(len(batches)) > math.MaxInt64-expectedSequence {
		return 0, fmt.Errorf("invalid board id, sequence, or batch count")
	}
	compact := make([]json.RawMessage, len(batches))
	for i, raw := range batches {
		parsed, err := elementMap(raw)
		if err != nil {
			return 0, err
		}
		if len(parsed) == 0 {
			return 0, fmt.Errorf("empty operation")
		}
		var b bytes.Buffer
		if err := json.Compact(&b, raw); err != nil {
			return 0, err
		}
		compact[i] = b.Bytes()
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	ops := m.boards[boardID]
	head := int64(len(ops))
	end := expectedSequence + int64(len(batches))
	if head == end {
		for i, raw := range compact {
			if !bytes.Equal(raw, ops[expectedSequence+int64(i)].Elements) {
				return 0, ErrSequenceConflict
			}
		}
		return end, nil
	}
	if head != expectedSequence {
		return 0, ErrSequenceConflict
	}
	for i, raw := range compact {
		ops = append(ops, Operation{Sequence: expectedSequence + int64(i) + 1, Elements: raw})
	}
	m.boards[boardID] = ops
	return end, nil
}

func (m *Memory) LoadBoard(_ context.Context, boardID string) (Snapshot, error) {
	m.mu.Lock()
	ops, ok := m.boards[boardID]
	ops = append([]Operation(nil), ops...)
	m.mu.Unlock()
	if !ok {
		return Snapshot{}, ErrNotFound
	}
	return RebuildSnapshot(Snapshot{Elements: json.RawMessage(`[]`)}, ops)
}

func (m *Memory) Checkpoint(ctx context.Context, boardID string) (Snapshot, error) {
	return m.LoadBoard(ctx, boardID)
}
