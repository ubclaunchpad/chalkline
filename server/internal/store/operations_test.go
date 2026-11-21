package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

var revision = json.RawMessage(`[{"id":"a","version":1,"versionNonce":8,"isDeleted":false}]`)
var deletedRevision = json.RawMessage(`[{"id":"a","version":2,"versionNonce":4,"isDeleted":true,"customData":{"kind":"database"},"startBinding":{"elementId":"b"}}]`)

func appendTest(t *testing.T, s *Postgres, board string, seq int64, raw json.RawMessage) {
	t.Helper()
	op, err := appendOne(s, t.Context(), board, seq, raw)
	if err != nil || op.Sequence != seq+1 {
		t.Fatalf("append: %+v %v", op, err)
	}
}

func TestOperationRecoveryAndCheckpoint(t *testing.T) {
	s := newTestStore(t)
	board := newBoardID(t)
	appendTest(t, s, board, 0, revision)
	checkpoint, err := s.Checkpoint(t.Context(), board)
	if err != nil || checkpoint.ThroughSequence != 1 {
		t.Fatalf("checkpoint: %+v %v", checkpoint, err)
	}
	appendTest(t, s, board, 1, deletedRevision)
	// A fresh pool has no memory of the original store or its connection.
	pool, err := pgxpool.NewWithConfig(t.Context(), s.pool.Config().Copy())
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	restored, err := NewPostgres(pool).LoadBoard(t.Context(), board)
	if err != nil || restored.ThroughSequence != 2 {
		t.Fatalf("restore: %+v %v", restored, err)
	}
	assertJSONEqual(t, restored.Elements, deletedRevision)
	for range 2 {
		checkpoint, err = s.Checkpoint(t.Context(), board)
		if err != nil {
			t.Fatal(err)
		}
		assertJSONEqual(t, checkpoint.Elements, restored.Elements)
	}
	var snapshots, operations int
	if err := s.pool.QueryRow(t.Context(), `SELECT (SELECT count(*) FROM board_snapshots WHERE board_id=$1), (SELECT count(*) FROM board_operations WHERE board_id=$1)`, board).Scan(&snapshots, &operations); err != nil {
		t.Fatal(err)
	}
	if snapshots != 2 || operations != 2 {
		t.Fatalf("snapshots=%d operations=%d", snapshots, operations)
	}
	// Corrupt a covered record: recovery must not read it again.
	if _, err := s.pool.Exec(t.Context(), `UPDATE board_operations SET elements='[null]' WHERE board_id=$1 AND sequence=1`, board); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadBoard(t.Context(), board)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, got.Elements, deletedRevision)
}

func TestOperationIsolationAndLegacySnapshot(t *testing.T) {
	s := newTestStore(t)
	a, b := newBoardID(t), newBoardID(t)
	seedSnapshot(t, s, a, json.RawMessage(`[{"id":"legacy"}]`))
	appendTest(t, s, a, 0, revision)
	appendTest(t, s, b, 0, deletedRevision)
	got, err := s.LoadBoard(t.Context(), a)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, got.Elements, json.RawMessage(`[{"id":"a","version":1,"versionNonce":8,"isDeleted":false},{"id":"legacy"}]`))
	got, err = s.LoadBoard(t.Context(), b)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, got.Elements, deletedRevision)
	for _, load := range []func(context.Context, string) (Snapshot, error){s.LoadBoard, s.Checkpoint} {
		if _, err := load(t.Context(), newBoardID(t)); !errors.Is(err, ErrNotFound) {
			t.Fatalf("missing board: %v", err)
		}
	}
}

func TestConcurrentAppendsAndCheckpoints(t *testing.T) {
	s := newTestStore(t)
	board := newBoardID(t)
	appendTest(t, s, board, 0, revision)
	var wg sync.WaitGroup
	results := make(chan error, 12)
	for i := range 8 {
		wg.Go(func() {
			raw := json.RawMessage(fmt.Sprintf(`[{"id":"a","version":2,"versionNonce":%d,"isDeleted":true}]`, i))
			_, err := appendOne(s, t.Context(), board, 1, raw)
			results <- err
		})
	}
	for range 4 {
		wg.Go(func() {
			_, err := s.Checkpoint(t.Context(), board)
			if err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if !errors.Is(err, ErrSequenceConflict) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful competing appends=%d", successes)
	}
	got, err := s.LoadBoard(t.Context(), board)
	if err != nil || got.ThroughSequence != 2 {
		t.Fatalf("load: %+v %v", got, err)
	}
	var items []map[string]any
	if err := json.Unmarshal(got.Elements, &items); err != nil || len(items) != 1 || items[0]["isDeleted"] != true {
		t.Fatalf("bad restored winner: %s", got.Elements)
	}
}

func TestOperationFailures(t *testing.T) {
	s := newTestStore(t)
	board := newBoardID(t)
	if _, err := appendOne(s, t.Context(), board, 4, revision); !errors.Is(err, ErrSequenceConflict) {
		t.Fatal(err)
	}
	if _, err := s.LoadBoard(t.Context(), board); !errors.Is(err, ErrNotFound) {
		t.Fatalf("failed append created board: %v", err)
	}
	// Invalid payload must not create a board.
	if _, err := appendOne(s, t.Context(), board, 0, json.RawMessage(`[{"id":"a",]`)); err == nil {
		t.Fatal("accepted malformed JSON")
	}
	if _, err := s.LoadBoard(t.Context(), board); !errors.Is(err, ErrNotFound) {
		t.Fatalf("database failure created board: %v", err)
	}
	appendTest(t, s, board, 0, revision)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := appendOne(s, ctx, board, 1, deletedRevision); err == nil {
		t.Fatal("canceled append succeeded")
	}
	if _, err := s.LoadBoard(ctx, board); err == nil {
		t.Fatal("canceled load succeeded")
	}
	if _, err := s.Checkpoint(ctx, board); err == nil {
		t.Fatal("canceled checkpoint succeeded")
	}
	// A hole must fail recovery and must not publish a checkpoint.
	if _, err := s.pool.Exec(t.Context(), `DELETE FROM board_operations WHERE board_id=$1`, board); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Checkpoint(t.Context(), board); err == nil {
		t.Fatal("checkpoint accepted log hole")
	}
	var count int
	if err := s.pool.QueryRow(t.Context(), `SELECT count(*) FROM board_snapshots WHERE board_id=$1`, board).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed checkpoint persisted: count=%d err=%v", count, err)
	}

	s.pool.Close()
	if _, err := s.LoadBoard(t.Context(), board); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("unavailable database: %v", err)
	}
	if _, err := appendOne(s, t.Context(), board, 1, revision); err == nil {
		t.Fatal("closed pool append succeeded")
	}
	if _, err := s.Checkpoint(t.Context(), board); err == nil {
		t.Fatal("closed pool checkpoint succeeded")
	}
}
