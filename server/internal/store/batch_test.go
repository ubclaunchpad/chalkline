package store

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestAppendOperationsRetry(t *testing.T) {
	s := newTestStore(t)
	board := newBoardID(t)
	batches := []json.RawMessage{revision, deletedRevision}
	for range 2 {
		seq, err := s.AppendOperations(t.Context(), board, 0, batches)
		if err != nil || seq != 2 {
			t.Fatalf("seq=%d err=%v", seq, err)
		}
	}
	if _, err := s.AppendOperations(t.Context(), board, 0, []json.RawMessage{revision, revision}); !errors.Is(err, ErrSequenceConflict) {
		t.Fatalf("mismatching retry: %v", err)
	}
	got, err := s.LoadBoard(t.Context(), board)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, got.Elements, deletedRevision)
	var count int
	if err := s.pool.QueryRow(t.Context(), `SELECT count(*) FROM board_operations WHERE board_id=$1`, board).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("duplicate operations: %d", count)
	}
}

func TestJSONSpellingSurvivesCheckpoint(t *testing.T) {
	s := newTestStore(t)
	board := newBoardID(t)
	raw := json.RawMessage(`[{"id":"a","version":1,"versionNonce":0,"isDeleted":false,"x":1e+10,"label":"<x>","unknown":1.00}]`)
	if _, err := s.AppendOperations(t.Context(), board, 0, []json.RawMessage{raw}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Checkpoint(t.Context(), board); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadBoard(t.Context(), board)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Elements) != string(raw) {
		t.Fatalf("JSON changed: %s", got.Elements)
	}
}
