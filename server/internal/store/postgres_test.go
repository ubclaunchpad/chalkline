package store

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// newTestStore connects to DATABASE_URL. It skips the test
// when DATABASE_URL is unset so CI without a database passes.
func newTestStore(t *testing.T) *Postgres {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set; run `make db-up && make db-migrate` to run store integration tests")
	}
	pool, err := pgxpool.New(t.Context(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(t.Context()); err != nil {
		t.Fatalf("ping database: %v", err)
	}
	return NewPostgres(pool)
}

// newBoardID returns an ID no other test run uses, so tests never share rows.
func newBoardID(t *testing.T) string {
	t.Helper()
	return "test-" + rand.Text()
}

// assertJSONEqual compares parsed values because jsonb normalizes whitespace
// and key order.
func assertJSONEqual(t *testing.T, got, want json.RawMessage) {
	t.Helper()
	var g, w any
	if err := json.Unmarshal(got, &g); err != nil {
		t.Fatalf("unmarshal got %s: %v", got, err)
	}
	if err := json.Unmarshal(want, &w); err != nil {
		t.Fatalf("unmarshal want %s: %v", want, err)
	}
	if !reflect.DeepEqual(g, w) {
		t.Fatalf("elements = %s, want %s", got, want)
	}
}

func TestPostgresSaveThenLoad(t *testing.T) {
	s := newTestStore(t)
	ctx := t.Context()
	board := newBoardID(t)
	elements := json.RawMessage(`[{"id": "a", "type": "rectangle", "customData": {"kind": "database"}}]`)

	if err := s.SaveSnapshot(ctx, board, elements); err != nil {
		t.Fatalf("SaveSnapshot: %v", err)
	}
	got, err := s.LatestSnapshot(ctx, board)
	if err != nil {
		t.Fatalf("LatestSnapshot: %v", err)
	}
	assertJSONEqual(t, got, elements)
}

func TestPostgresLatestSnapshotReturnsNewest(t *testing.T) {
	s := newTestStore(t)
	ctx := t.Context()
	board := newBoardID(t)
	first := json.RawMessage(`[{"id": "a"}]`)
	second := json.RawMessage(`[{"id": "a"}, {"id": "b"}]`)

	if err := s.SaveSnapshot(ctx, board, first); err != nil {
		t.Fatalf("SaveSnapshot first: %v", err)
	}
	createdAt, updatedAt := boardTimes(t, s, board)
	if err := s.SaveSnapshot(ctx, board, second); err != nil {
		t.Fatalf("SaveSnapshot second: %v", err)
	}

	got, err := s.LatestSnapshot(ctx, board)
	if err != nil {
		t.Fatalf("LatestSnapshot: %v", err)
	}
	assertJSONEqual(t, got, second)

	createdAgain, updatedAgain := boardTimes(t, s, board)
	if !createdAgain.Equal(createdAt) {
		t.Errorf("created_at changed from %v to %v", createdAt, createdAgain)
	}
	if !updatedAgain.After(updatedAt) {
		t.Errorf("updated_at = %v, want after %v", updatedAgain, updatedAt)
	}
}

func TestPostgresLatestSnapshotKeepsBoardsSeparate(t *testing.T) {
	s := newTestStore(t)
	ctx := t.Context()
	boardA, boardB := newBoardID(t), newBoardID(t)
	elementsA := json.RawMessage(`[{"id": "a"}]`)

	if err := s.SaveSnapshot(ctx, boardA, elementsA); err != nil {
		t.Fatalf("SaveSnapshot A: %v", err)
	}
	if err := s.SaveSnapshot(ctx, boardB, json.RawMessage(`[{"id": "b"}]`)); err != nil {
		t.Fatalf("SaveSnapshot B: %v", err)
	}

	got, err := s.LatestSnapshot(ctx, boardA)
	if err != nil {
		t.Fatalf("LatestSnapshot: %v", err)
	}
	assertJSONEqual(t, got, elementsA)
}

func TestPostgresLatestSnapshotNotFound(t *testing.T) {
	s := newTestStore(t)

	_, err := s.LatestSnapshot(t.Context(), newBoardID(t))
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("LatestSnapshot error = %v, want ErrNotFound", err)
	}
}

func TestPostgresSaveSnapshotRejectsInvalidJSON(t *testing.T) {
	s := newTestStore(t)
	ctx := t.Context()
	board := newBoardID(t)

	if err := s.SaveSnapshot(ctx, board, json.RawMessage(`{not json`)); err == nil {
		t.Fatal("SaveSnapshot with invalid JSON succeeded, want error")
	}
	// The transaction rolled back, so the board row was not left behind.
	if _, err := s.LatestSnapshot(ctx, board); !errors.Is(err, ErrNotFound) {
		t.Fatalf("LatestSnapshot error = %v, want ErrNotFound", err)
	}
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM boards WHERE id = $1)`, board).Scan(&exists); err != nil {
		t.Fatalf("check board row: %v", err)
	}
	if exists {
		t.Fatal("board row exists after failed save, want rollback")
	}
}

func boardTimes(t *testing.T, s *Postgres, boardID string) (createdAt, updatedAt time.Time) {
	t.Helper()
	err := s.pool.QueryRow(t.Context(),
		`SELECT created_at, updated_at FROM boards WHERE id = $1`, boardID,
	).Scan(&createdAt, &updatedAt)
	if err != nil {
		t.Fatalf("read board times: %v", err)
	}
	return createdAt, updatedAt
}
