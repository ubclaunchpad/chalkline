package store

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"os"
	"reflect"
	"testing"

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

// assertJSONEqual compares JSON values independent of whitespace and key order.
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

// appendOne keeps singleton fixtures readable while exercising the batch API.
func appendOne(s *Postgres, ctx context.Context, board string, seq int64, raw json.RawMessage) (Operation, error) {
	end, err := s.AppendOperations(ctx, board, seq, []json.RawMessage{raw})
	return Operation{Sequence: end, Elements: raw}, err
}

func seedSnapshot(t *testing.T, s *Postgres, board string, raw json.RawMessage) {
	t.Helper()
	if _, err := s.pool.Exec(t.Context(), `INSERT INTO boards(id) VALUES($1)`, board); err != nil {
		t.Fatal(err)
	}
	if _, err := s.pool.Exec(t.Context(), `INSERT INTO board_snapshots(board_id,elements) VALUES($1,$2)`, board, string(raw)); err != nil {
		t.Fatal(err)
	}
}
