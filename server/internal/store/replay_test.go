package store

import (
	"encoding/json"
	"testing"
)

func TestRebuildSnapshot(t *testing.T) {
	base := Snapshot{Elements: json.RawMessage(`[{"id":"z","version":1,"versionNonce":8,"isDeleted":false,"customData":{"kind":"database"},"index":"a1"}]`), ThroughSequence: 4}
	ops := []Operation{
		{5, json.RawMessage(`[{"id":"a","version":1,"versionNonce":3,"isDeleted":false,"startBinding":{"elementId":"z"},"future":{"number":9007199254740993}}]`)},
		{6, json.RawMessage(`[{"id":"z","version":2,"versionNonce":5,"isDeleted":true,"customData":{"kind":"database"},"index":"a1"}]`)},
	}
	before := string(base.Elements)
	got, err := RebuildSnapshot(base, ops)
	if err != nil {
		t.Fatal(err)
	}
	if got.ThroughSequence != 6 {
		t.Fatal(got.ThroughSequence)
	}
	want := json.RawMessage(`[{"id":"a","version":1,"versionNonce":3,"isDeleted":false,"startBinding":{"elementId":"z"},"future":{"number":9007199254740993}},{"id":"z","version":2,"versionNonce":5,"isDeleted":true,"customData":{"kind":"database"},"index":"a1"}]`)
	// Compare raw decoded fields rather than float64 to preserve large unknown numbers.
	var gotItems, wantItems []map[string]json.RawMessage
	_ = json.Unmarshal(got.Elements, &gotItems)
	_ = json.Unmarshal(want, &wantItems)
	if string(gotItems[0]["future"]) != string(wantItems[0]["future"]) {
		t.Fatal("unknown number changed")
	}
	assertJSONEqual(t, got.Elements, want)
	again, err := RebuildSnapshot(got, nil)
	if err != nil || string(again.Elements) != string(got.Elements) {
		t.Fatalf("unstable replay: %v", err)
	}
	got.Elements[0] = 'x'
	if string(base.Elements) != before || ops[0].Elements[0] != '[' {
		t.Fatal("input mutated")
	}
}

func TestRebuildRejectsInvalidHistory(t *testing.T) {
	for _, raw := range []string{`null`, `{}`, `[null]`, `[{"id":""}]`, `[{"id":"a"},{"id":"a"}]`, `[{"ID":"a"}]`, `[1]`} {
		t.Run(raw, func(t *testing.T) {
			if _, err := RebuildSnapshot(Snapshot{Elements: json.RawMessage(raw)}, nil); err == nil {
				t.Fatal("accepted invalid snapshot")
			}
			if _, err := RebuildSnapshot(Snapshot{Elements: json.RawMessage(`[]`)}, []Operation{{1, json.RawMessage(raw)}}); err == nil {
				t.Fatal("accepted invalid operation")
			}
		})
	}
	for _, seq := range []int64{-1, 0, 2} {
		if _, err := RebuildSnapshot(Snapshot{Elements: json.RawMessage(`[]`)}, []Operation{{seq, json.RawMessage(`[{"id":"a"}]`)}}); err == nil {
			t.Fatalf("accepted sequence %d", seq)
		}
	}
	if _, err := RebuildSnapshot(Snapshot{Elements: json.RawMessage(`[]`)}, []Operation{{1, json.RawMessage(`[]`)}}); err == nil {
		t.Fatal("accepted empty batch")
	}
}
