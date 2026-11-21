// Package store persists boards so they survive a server restart.
package store

import (
	"context"
	"encoding/json"
	"errors"
)

// ErrNotFound reports that a board has no saved snapshot.
var ErrNotFound = errors.New("store: not found")

// ErrSequenceConflict means the caller must reload before submitting more edits.
var ErrSequenceConflict = errors.New("store: sequence conflict")

// ErrLogStarted prevents untracked snapshots from replacing logged board state.
var ErrLogStarted = errors.New("store: operation log already started")

// Store saves accepted edits and reconstructs durable board state.
type Store interface {
	AppendOperations(ctx context.Context, boardID string, expectedSequence int64, batches []json.RawMessage) (int64, error)
	AppendOperation(ctx context.Context, boardID string, expectedSequence int64, elements json.RawMessage) (Operation, error)
	LoadBoard(ctx context.Context, boardID string) (Snapshot, error)
	Checkpoint(ctx context.Context, boardID string) (Snapshot, error)
	// saves the board’s Excalidraw elements as raw JSON
	SaveSnapshot(ctx context.Context, boardID string, elements json.RawMessage) error
	// returns the most recent saved JSON
	LatestSnapshot(ctx context.Context, boardID string) (json.RawMessage, error) // ErrNotFound if none
}
