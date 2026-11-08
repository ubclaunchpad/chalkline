package realtime

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// element builds a valid incoming element. The scene treats fingerprints as
// opaque, so hashing the raw bytes is enough here; real fingerprints come
// from parsing.
func element(id string, version, nonce int64, deleted bool, note string) incomingElement {
	raw := fmt.Sprintf(`{"id":%q,"version":%d,"versionNonce":%d,"isDeleted":%t,"note":%q}`,
		id, version, nonce, deleted, note)
	return incomingElement{
		id:           id,
		raw:          json.RawMessage(raw),
		version:      version,
		versionNonce: nonce,
		isDeleted:    deleted,
		fingerprint:  sha256.Sum256([]byte(raw)),
	}
}

// sizedElement builds an element whose raw bytes are exactly length long.
func sizedElement(t *testing.T, id string, version, nonce int64, length int) incomingElement {
	t.Helper()
	base := element(id, version, nonce, false, "")
	padding := length - len(base.raw)
	if padding < 0 {
		t.Fatalf("length %d is shorter than an empty element", length)
	}
	return element(id, version, nonce, false, strings.Repeat("x", padding))
}

func mustApply(t *testing.T, s *scene, in ...incomingElement) (winners, corrections []json.RawMessage) {
	t.Helper()
	winners, corrections, err := s.apply(in)
	if err != nil {
		t.Fatalf("unexpected %s: %s", err.code, err.message)
	}
	return winners, corrections
}

func storedRaw(t *testing.T, s *scene, id string) string {
	t.Helper()
	stored, ok := s.elements[id]
	if !ok {
		t.Fatalf("element %q is not stored", id)
	}
	return string(stored.raw)
}

// The four rule cases from mergeElements in frontend/src/realtime/sceneSync.test.ts.
// They check that the server picks the same winner as the browser.
func TestSceneMatchesBrowserRule(t *testing.T) {
	for _, tt := range []struct {
		name          string
		first, second incomingElement
		want          incomingElement
	}{
		{
			name:   "higher version wins",
			first:  element("shape", 2, 100, false, ""),
			second: element("shape", 3, 900, false, ""),
			want:   element("shape", 3, 900, false, ""),
		},
		{
			name:   "lower nonce breaks a version tie",
			first:  element("shape", 3, 900, false, ""),
			second: element("shape", 3, 100, false, ""),
			want:   element("shape", 3, 100, false, ""),
		},
		{
			name:   "higher-version edit beats a deletion",
			first:  element("shape", 2, 10, true, ""),
			second: element("shape", 3, 20, false, "moved"),
			want:   element("shape", 3, 20, false, "moved"),
		},
		{
			name:   "arrival order does not matter",
			first:  element("shape", 2, 800, false, "x=20"),
			second: element("shape", 2, 200, false, "x=80"),
			want:   element("shape", 2, 200, false, "x=80"),
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			for _, order := range [][2]incomingElement{{tt.first, tt.second}, {tt.second, tt.first}} {
				s := newScene()
				mustApply(t, s, order[0])
				mustApply(t, s, order[1])
				if got := storedRaw(t, s, "shape"); got != string(tt.want.raw) {
					t.Fatalf("stored %s, want %s", got, tt.want.raw)
				}
			}
		})
	}
}

func TestSceneOutcomes(t *testing.T) {
	t.Run("new element wins and is forwarded", func(t *testing.T) {
		s := newScene()
		winners, corrections := mustApply(t, s, element("a", 1, 1, false, ""))
		if len(winners) != 1 || len(corrections) != 0 {
			t.Fatalf("winners %d, corrections %d", len(winners), len(corrections))
		}
	})

	t.Run("stale edit gets a correction and is not forwarded", func(t *testing.T) {
		s := newScene()
		current := element("a", 7, 1, false, "current")
		mustApply(t, s, current)
		winners, corrections := mustApply(t, s, element("a", 6, 1, false, "stale"))
		if len(winners) != 0 || len(corrections) != 1 || string(corrections[0]) != string(current.raw) {
			t.Fatalf("winners %q, corrections %q", winners, corrections)
		}
		if got := storedRaw(t, s, "a"); got != string(current.raw) {
			t.Fatalf("stored %s", got)
		}
	})

	t.Run("duplicate is a silent no-op", func(t *testing.T) {
		s := newScene()
		a := element("a", 1, 1, false, "")
		mustApply(t, s, a)
		winners, corrections := mustApply(t, s, a)
		if len(winners) != 0 || len(corrections) != 0 {
			t.Fatalf("winners %d, corrections %d", len(winners), len(corrections))
		}
	})

	t.Run("conflict rejects the whole change", func(t *testing.T) {
		s := newScene()
		mustApply(t, s, element("a", 1, 1, false, "mine"))
		_, _, err := s.apply([]incomingElement{
			element("b", 1, 1, false, "would win"),
			element("a", 1, 1, false, "different content"),
		})
		if err == nil || err.code != codeConflict || err.elementID != "a" {
			t.Fatalf("got %+v, want conflict on a", err)
		}
		if _, stored := s.elements["b"]; stored || len(s.elements) != 1 {
			t.Fatal("a rejected change stored an element")
		}
	})

	t.Run("new tombstone is stored and beats an older live copy", func(t *testing.T) {
		s := newScene()
		tombstone := element("a", 5, 1, true, "")
		mustApply(t, s, tombstone)
		winners, corrections := mustApply(t, s, element("a", 4, 1, false, "older"))
		if len(winners) != 0 || len(corrections) != 1 {
			t.Fatalf("winners %d, corrections %d", len(winners), len(corrections))
		}
		if got := storedRaw(t, s, "a"); got != string(tombstone.raw) {
			t.Fatalf("stored %s", got)
		}
	})

	t.Run("mixed change forwards winners and corrects losers", func(t *testing.T) {
		s := newScene()
		mustApply(t, s, element("a", 5, 1, false, ""))
		winners, corrections := mustApply(t, s,
			element("a", 4, 1, false, "stale"),
			element("b", 1, 1, false, "new"),
		)
		if len(winners) != 1 || len(corrections) != 1 {
			t.Fatalf("winners %d, corrections %d", len(winners), len(corrections))
		}
	})
}

func TestSceneSizeAccounting(t *testing.T) {
	s := newScene()
	mustApply(t, s, element("a", 1, 1, false, "first"), element("b", 1, 1, false, ""))
	mustApply(t, s, element("a", 2, 1, false, "longer than before"))
	mustApply(t, s, element("b", 2, 1, true, ""))
	got := messageSize(len(s.elements), s.rawBytes)
	if want := len(correctionMessage(s.snapshot()).data); got != want {
		t.Fatalf("board size %d, correction message %d", got, want)
	}
	if got := len(snapshotMessage(s.snapshot()).data); got > messageSize(len(s.elements), s.rawBytes) {
		t.Fatalf("snapshot %d bytes is larger than the board size", got)
	}
}

func TestSceneBoardLimits(t *testing.T) {
	// One element on an empty board makes the board size largestEnvelope + its length.
	atNewLimit := newElementLimit - largestEnvelope
	atHardLimit := hardLimit - largestEnvelope

	t.Run("new element", func(t *testing.T) {
		s := newScene()
		_, _, err := s.apply([]incomingElement{sizedElement(t, "a", 1, 1, atNewLimit+1)})
		if err == nil || err.code != codeBoardFull {
			t.Fatalf("got %+v, want board_full", err)
		}
		if len(s.elements) != 0 || s.rawBytes != 0 {
			t.Fatal("a rejected change changed the board")
		}
		mustApply(t, s, sizedElement(t, "a", 1, 1, atNewLimit))
	})

	t.Run("one oversized element", func(t *testing.T) {
		s := newScene()
		_, _, err := s.apply([]incomingElement{sizedElement(t, "a", 1, 1, hardLimit)})
		if err == nil || err.code != codeBoardFull {
			t.Fatalf("got %+v, want board_full", err)
		}
	})

	t.Run("existing elements may use the headroom", func(t *testing.T) {
		s := newScene()
		mustApply(t, s, sizedElement(t, "a", 1, 1, atNewLimit))
		mustApply(t, s, sizedElement(t, "a", 2, 1, atHardLimit))
		before := s.rawBytes
		_, _, err := s.apply([]incomingElement{sizedElement(t, "a", 3, 1, atHardLimit+1)})
		if err == nil || err.code != codeBoardFull {
			t.Fatalf("got %+v, want board_full", err)
		}
		if s.rawBytes != before || storedRaw(t, s, "a") == "" {
			t.Fatal("a rejected change changed the board")
		}
	})

	t.Run("a full board accepts changes that do not grow it", func(t *testing.T) {
		s := newScene()
		mustApply(t, s, sizedElement(t, "a", 1, 1, atNewLimit))
		mustApply(t, s, sizedElement(t, "a", 2, 1, atHardLimit))
		mustApply(t, s, sizedElement(t, "a", 3, 1, atHardLimit)) // Same length.
		tombstone := element("a", 4, 1, true, "")                // Shorter.
		mustApply(t, s, tombstone)
		if !s.elements["a"].isDeleted {
			t.Fatal("delete was not stored")
		}
	})

	t.Run("a change that adds an element but shrinks the board is accepted", func(t *testing.T) {
		s := newScene()
		mustApply(t, s, sizedElement(t, "a", 1, 1, atNewLimit))
		mustApply(t, s, sizedElement(t, "a", 2, 1, atNewLimit+1000)) // Above the new-element limit.
		before := messageSize(len(s.elements), s.rawBytes)
		mustApply(t, s,
			sizedElement(t, "a", 3, 1, atNewLimit+800), // 200 bytes shorter.
			element("b", 1, 1, false, ""),              // A new element, well under 200 bytes.
		)
		if after := messageSize(len(s.elements), s.rawBytes); after >= before {
			t.Fatalf("board grew from %d to %d", before, after)
		}
	})

	t.Run("a full board rejects new elements", func(t *testing.T) {
		s := newScene()
		mustApply(t, s, sizedElement(t, "a", 1, 1, atNewLimit))
		_, _, err := s.apply([]incomingElement{element("b", 1, 1, false, "")})
		if err == nil || err.code != codeBoardFull {
			t.Fatalf("got %+v, want board_full", err)
		}
	})
}

func TestSceneSnapshotIsSortedByID(t *testing.T) {
	s := newScene()
	mustApply(t, s, element("c", 1, 1, false, ""), element("a", 1, 1, false, ""), element("b", 1, 1, true, ""))
	var ids []string
	for _, raw := range s.snapshot() {
		var e struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &e); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, e.ID)
	}
	if strings.Join(ids, ",") != "a,b,c" {
		t.Fatalf("snapshot order %v", ids)
	}
}
