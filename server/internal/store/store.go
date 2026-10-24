// Package store persists boards so they survive a server restart.
package store

import (
	"context"
	"encoding/json"
	"errors"
)

// ErrNotFound reports that a board has no saved snapshot.
var ErrNotFound = errors.New("store: not found")

// Store saves and loads board snapshots.
type Store interface {
	// saves the board’s Excalidraw elements as raw JSON
	SaveSnapshot(ctx context.Context, boardID string, elements json.RawMessage) error
	// returns the most recent saved JSON
	LatestSnapshot(ctx context.Context, boardID string) (json.RawMessage, error) // ErrNotFound if none
}
