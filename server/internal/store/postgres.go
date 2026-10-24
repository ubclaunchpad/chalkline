package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres is a Store backed by the tables in server/migrations
type Postgres struct {
	pool *pgxpool.Pool
}

var _ Store = (*Postgres)(nil)

// NewPostgres returns a Store that uses pool
func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

// SaveSnapshot creates or touches the board row and inserts the snapshot in
// one transaction, so a board never exists without its first snapshot.
func (p *Postgres) SaveSnapshot(ctx context.Context, boardID string, elements json.RawMessage) error {
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO boards (id) VALUES ($1)
			 ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
			boardID,
		); err != nil {
			return fmt.Errorf("upsert board: %w", err)
		}
		// Pass the JSON as a string; pgx would encode a []byte as bytea.
		if _, err := tx.Exec(ctx,
			`INSERT INTO board_snapshots (board_id, elements) VALUES ($1, $2)`,
			boardID, string(elements),
		); err != nil {
			return fmt.Errorf("insert snapshot: %w", err)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("save snapshot for board %q: %w", boardID, err)
	}
	return nil
}

// LatestSnapshot returns the most recently saved snapshot. Snapshots saved in
// the same transaction share a created_at, so id breaks the tie.
func (p *Postgres) LatestSnapshot(ctx context.Context, boardID string) (json.RawMessage, error) {
	var elements []byte
	err := p.pool.QueryRow(ctx,
		`SELECT elements FROM board_snapshots
		 WHERE board_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT 1`,
		boardID,
	).Scan(&elements)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load latest snapshot for board %q: %w", boardID, err)
	}
	return elements, nil
}
