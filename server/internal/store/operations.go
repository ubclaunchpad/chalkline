package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"
)

// AppendOperation commits one accepted batch. The expected sequence prevents
// concurrent callers from silently recording edits in a different room order.
// A commit error can have an unknown outcome: callers must reload, not blindly retry.
func (p *Postgres) AppendOperation(ctx context.Context, boardID string, expectedSequence int64, elements json.RawMessage) (Operation, error) {
	if !validID(boardID) || expectedSequence < 0 || expectedSequence == math.MaxInt64 {
		return Operation{}, fmt.Errorf("invalid board id or sequence")
	}
	parsed, err := elementMap(elements)
	if err != nil {
		return Operation{}, err
	}
	if len(parsed) == 0 {
		return Operation{}, fmt.Errorf("empty operation")
	}
	sequence := expectedSequence + 1
	err = pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO boards (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, boardID); err != nil {
			return err
		}
		var current int64
		if err := tx.QueryRow(ctx, `SELECT operation_sequence FROM boards WHERE id = $1 FOR UPDATE`, boardID).Scan(&current); err != nil {
			return err
		}
		if current != expectedSequence {
			return ErrSequenceConflict
		}
		if _, err := tx.Exec(ctx, `INSERT INTO board_operations (board_id, sequence, elements) VALUES ($1, $2, $3)`, boardID, sequence, string(elements)); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE boards SET operation_sequence = $2, updated_at = now() WHERE id = $1`, boardID, sequence)
		return err
	})
	if err != nil {
		return Operation{}, fmt.Errorf("append operation for %q: %w", boardID, err)
	}
	return Operation{Sequence: sequence, Elements: append(json.RawMessage(nil), elements...)}, nil
}

// LoadBoard reads a consistent snapshot and log tail, including boards that have
// operations but no checkpoint yet. Database errors never become an empty scene.
func (p *Postgres) LoadBoard(ctx context.Context, boardID string) (Snapshot, error) {
	var result Snapshot
	err := pgx.BeginTxFunc(ctx, p.pool, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}, func(tx pgx.Tx) error {
		var head int64
		err := tx.QueryRow(ctx, `SELECT operation_sequence FROM boards WHERE id = $1`, boardID).Scan(&head)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		result, _, err = rebuildBoard(ctx, tx, boardID, head)
		return err
	})
	if err != nil {
		return Snapshot{}, fmt.Errorf("load board %q: %w", boardID, err)
	}
	return result, nil
}

// Checkpoint captures all committed operations under the same board lock used
// by append. Covered operations are retained. An unchanged checkpoint is reused.
func (p *Postgres) Checkpoint(ctx context.Context, boardID string) (Snapshot, error) {
	var result Snapshot
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		var head int64
		err := tx.QueryRow(ctx, `SELECT operation_sequence FROM boards WHERE id = $1 FOR UPDATE`, boardID).Scan(&head)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		var checkpoint int64
		result, checkpoint, err = rebuildBoard(ctx, tx, boardID, head)
		if err != nil || checkpoint == head {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO board_snapshots (board_id, elements, through_sequence) VALUES ($1, $2, $3)`, boardID, string(result.Elements), result.ThroughSequence)
		return err
	})
	if err != nil {
		return Snapshot{}, fmt.Errorf("checkpoint board %q: %w", boardID, err)
	}
	return result, nil
}

func rebuildBoard(ctx context.Context, tx pgx.Tx, boardID string, head int64) (Snapshot, int64, error) {
	base := Snapshot{Elements: json.RawMessage(`[]`)}
	checkpoint := int64(-1)
	err := tx.QueryRow(ctx, `SELECT elements, through_sequence FROM board_snapshots WHERE board_id = $1 ORDER BY id DESC LIMIT 1`, boardID).Scan(&base.Elements, &base.ThroughSequence)
	if err == nil {
		checkpoint = base.ThroughSequence
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Snapshot{}, 0, err
	}
	if base.ThroughSequence > head {
		return Snapshot{}, 0, fmt.Errorf("checkpoint ahead of log")
	}
	rows, err := tx.Query(ctx, `SELECT sequence, elements FROM board_operations WHERE board_id = $1 AND sequence > $2 AND sequence <= $3 ORDER BY sequence`, boardID, base.ThroughSequence, head)
	if err != nil {
		return Snapshot{}, 0, err
	}
	defer rows.Close()
	var operations []Operation
	for rows.Next() {
		var op Operation
		if err := rows.Scan(&op.Sequence, &op.Elements); err != nil {
			return Snapshot{}, 0, err
		}
		operations = append(operations, op)
	}
	if err := rows.Err(); err != nil {
		return Snapshot{}, 0, err
	}
	result, err := RebuildSnapshot(base, operations)
	if err != nil {
		return Snapshot{}, 0, err
	}
	if result.ThroughSequence != head {
		return Snapshot{}, 0, fmt.Errorf("operation log is incomplete")
	}
	return result, checkpoint, nil
}
