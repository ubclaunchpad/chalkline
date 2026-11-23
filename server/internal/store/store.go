// Package store persists boards so they survive a server restart.
package store

import (
	"context"
	"encoding/json"
	"errors"
)

// ErrNotFound reports that a board has no durable state.
var ErrNotFound = errors.New("store: not found")

// ErrSequenceConflict means the caller must reload before submitting more edits.
var ErrSequenceConflict = errors.New("store: sequence conflict")

// Store saves accepted edits and reconstructs durable board state.
type Store interface {
	AppendOperations(ctx context.Context, boardID string, expectedSequence int64, batches []json.RawMessage) (int64, error)
	LoadBoard(ctx context.Context, boardID string) (Snapshot, error)
	Checkpoint(ctx context.Context, boardID string) (Snapshot, error)
}
